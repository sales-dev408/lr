# Data Model — PostgreSQL

All tables use `uuid` primary keys (`gen_random_uuid()` from `pgcrypto`),
`timestamptz` timestamps, and `CHECK` constraints for enum-like columns.
`citext` is used for case-insensitive emails (with a `lower()` unique-index
fallback if the extension is unavailable).

## Entity relationships

```
admins                         cards ─────────< card_vendors >───── vendors
users (customers)                │                                    │
  │  │  │                        │                                    │
  │  │  └──< passes >── cards     └──────< discounts >─────────────────┘
  │  └─────< gift_cards >── cards            │
  └────────< redemptions >───────────────────┘   (redemption references
                                                   discount OR gift_card,
                                                   plus card + vendor + user + pass)
transactions  (audit trail — references any entity by type + id)
```

## Tables

### users (customers)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| email | citext unique null | email OR phone required |
| phone | text unique null | |
| password_hash | text null | null for social-only accounts |
| social_provider | text null | google/apple/facebook |
| social_id | text null | |
| full_name | text | |
| status | text | check (active, suspended, deleted) |
| created_at / updated_at | timestamptz | |

### vendors
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | |
| location | text | street address |
| city | text | drives city-based rule variations |
| category | text | e.g. restaurant, retail, entertainment |
| pos_type | text | check (square, stripe, clover, toast, other) |
| email | citext unique | login |
| password_hash | text | |
| status | text | check (pending, approved, rejected, suspended) default pending |
| created_at / updated_at | timestamptz | |

### admins
`id, email citext unique, password_hash, role check (owner, admin, analyst), created_at`.
Role-based access for the admin dashboard.

### cards (Master Cards)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | |
| theme | text | check (sports, entertainment, shops_restaurants) |
| description / image_url | text | |
| expiration_date | timestamptz null | global expiration rule |
| max_uses | int null | global max uses across all customers |
| status | text | check (draft, active, archived) |

### card_vendors (participating businesses)
Join table: `card_id, vendor_id, joined_at`, pk `(card_id, vendor_id)`.

### discounts (per vendor per card)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| card_id / vendor_id | uuid fk | unique `(card_id, vendor_id)` |
| type | text | check (fixed, percent, bogo) |
| value | numeric | dollars (fixed), percent (percent), 0 (bogo) |
| min_purchase | numeric default 0 | |
| max_uses_total | int null | per-discount cap |
| max_uses_per_customer | int null | |
| uses_count | int default 0 | bumped atomically under `FOR UPDATE` |
| city_overrides | jsonb default '{}' | `{ "Phoenix": {"type":"percent","value":15} }` |
| active | boolean default true | vendor-toggleable |

### passes (Apple / Google Wallet)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id / card_id | uuid fk | |
| platform | text | check (apple, google) |
| serial_number | text unique | PassKit serial |
| auth_token | text | PassKit web-service auth |
| lookup_token | text unique | opaque token in barcode/NFC → discount lookup |
| device_library_id | text null | APNs device registration |
| push_token | text null | APNs push token |

### gift_cards (balance-based, optional)
`id, user_id, card_id null, code unique, balance numeric, currency default USD,
status check (active, depleted, disabled)`. Balance decremented under
`FOR UPDATE` during redemption.

### redemptions
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| discount_id | uuid fk null | one of discount/gift_card set |
| gift_card_id | uuid fk null | |
| card_id / vendor_id | uuid fk | |
| user_id | uuid fk null | |
| pass_id | uuid fk null | |
| amount_applied | numeric | |
| city | text null | city used for rule resolution |
| status | text | check (approved, denied) |
| reason | text null | denial reason for audit |
| redeemed_at | timestamptz | indexed with vendor_id for analytics |

Indexes: `(vendor_id, redeemed_at)`, `(card_id)`, `(user_id)`.

### transactions (audit trail)
`id, actor_type (admin/vendor/customer/system), actor_id null, action,
entity_type, entity_id null, metadata jsonb, ip text null, created_at`.
Every privileged mutation and every redemption writes a row here.

## Safe redemption with row-level locking

```sql
BEGIN;
  SELECT * FROM discounts WHERE id = $1 FOR UPDATE;      -- lock the row
  -- (for balance cards) SELECT * FROM gift_cards WHERE id = $x FOR UPDATE;
  -- validate: card active & not expired, vendor participates, discount.active,
  --   uses_count < max_uses_total, per-customer count < max_uses_per_customer,
  --   card.max_uses not exceeded, min_purchase met, city rule resolved.
  INSERT INTO redemptions (...) VALUES (...);            -- approved or denied
  UPDATE discounts SET uses_count = uses_count + 1 WHERE id = $1;  -- only if approved
  -- (balance) UPDATE gift_cards SET balance = balance - $amt WHERE id = $x;
  INSERT INTO transactions (...) VALUES (...);           -- audit
COMMIT;   -- ROLLBACK on error
```

`FOR UPDATE` serializes concurrent redemptions of the same discount so usage
caps and gift-card balances can never be oversold under load.
