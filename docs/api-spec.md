# API Specification

Base URL: `/api`. JSON request/response. Auth via `Authorization: Bearer <JWT>`.
JWT carries `sub` (subject id) and `role` (`admin` | `vendor` | `customer`).
Errors: `{ "error": { "code": string, "message": string } }` with appropriate
HTTP status. Login/registration endpoints require a CAPTCHA token when a CAPTCHA
provider is configured. **No MFA** by design.

## Auth
| Method | Path | Role | Body → Response |
|---|---|---|---|
| POST | `/auth/register` | public | `{email?, phone?, password?, social?, fullName, captchaToken}` → `{token, expiresIn, profile}` |
| POST | `/auth/login` | public | `{email?, phone?, password, captchaToken}` → `{token, expiresIn, profile}` |
| POST | `/auth/social` | public | `{provider, idToken}` → `{token, expiresIn, profile}` |
| POST | `/auth/vendor/login` | public | `{email, password, captchaToken}` → `{token, profile}` |
| POST | `/auth/admin/login` | public | `{email, password, captchaToken}` → `{token, profile}` |

## Cards & discounts
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/cards?theme=&city=` | public | Active cards + participating businesses + discounts. `city` applies `city_overrides`. |
| GET | `/cards/:id?city=` | public | Single card detail. |
| POST | `/admin/cards` | admin | Create master card. |
| PATCH | `/admin/cards/:id` | admin | Update (themes, global rules: expiration, max_uses, status). |
| DELETE | `/admin/cards/:id` | admin | Archive/delete. |
| POST | `/admin/cards/:id/vendors` | admin | `{vendorId}` add participating business. |
| DELETE | `/admin/cards/:id/vendors/:vendorId` | admin | Remove business. |
| POST | `/admin/discounts` | admin | `{cardId, vendorId, type, value, ...}` create per-business discount. |
| PATCH | `/admin/discounts/:id` | admin | Full edit. |
| DELETE | `/admin/discounts/:id` | admin | |
| PATCH | `/vendor/discounts/:id` | vendor | **Allowed fields only:** `value, min_purchase, max_uses_per_customer, active, city_overrides`. Ownership enforced. |
| GET | `/vendor/cards` | vendor | Cards this vendor participates in + their discount. |

## Wallet passes
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/passes` | customer | `{cardId, platform}` → mints serial/lookup/auth tokens. Apple → `.pkpass` (if certs) else unsigned `pass.json` + 501-style note. Google → save-link JWT (if configured) else stub. |
| GET | `/passes/:serial` | PassKit auth | Latest pass for device (PassKit web service). |
| POST | `/passes/:serial/registrations/:deviceId` | PassKit auth | Register device for APNs push. |
| DELETE | `/passes/:serial/registrations/:deviceId` | PassKit auth | Unregister. |

Pass payload includes a `barcodes` (QR = `lookup_token`) array and an Apple VAS
`nfc` block. See `nfc-qr-flows.md`.

## Lookup & redeem (POS / vendor tablet)
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/lookup/:lookupToken` | vendor/POS | Resolve pass → customer + card + available discounts at vendor. |
| GET | `/lookup/card/:cardId?vendorId=` | vendor/POS | Manual code entry path. |
| POST | `/redeem` | vendor/POS | Core redemption — see below. |

**`POST /redeem`**
```jsonc
// request
{ "lookupToken": "…",         // OR "cardId" + "userId"
  "vendorId": "…",
  "discountId": "…",           // optional; defaults to vendor's discount for the card
  "city": "Phoenix",           // optional; applies city_overrides
  "purchaseAmount": 42.00 }    // required for percent discounts
// response (valid)
{ "valid": true,
  "discount": { "type": "percent", "value": 15, "description": "15% off" },
  "amountApplied": 6.30,
  "instruction": "Apply 15% ($6.30) off manually at the register.",
  "redemptionId": "…" }
// response (invalid)
{ "valid": false, "reason": "max_uses_exceeded" }
```
Executed inside a transaction with `SELECT … FOR UPDATE` on the discount (and
gift-card) row. Both approved and denied outcomes write an audit row.

## Analytics
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/admin/analytics?from=&to=&city=` | admin | Totals (redemptions, unique customers), per-business usage, per-card, 30-day time series, top performers. |
| GET | `/vendor/analytics?period=daily\|weekly\|monthly` | vendor | Vendor-scoped counts, unique-customer insights (no PII), by card. |

## Vendor management (admin)
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/admin/vendors?status=&city=&category=` | admin | List/filter. |
| POST | `/admin/vendors` | admin | Create. |
| PATCH | `/admin/vendors/:id` | admin | Edit + status. |
| POST | `/admin/vendors/:id/approve` | admin | |
| POST | `/admin/vendors/:id/reject` | admin | |
| POST | `/admin/vendors/:id/reset-password` | admin | Returns temp password. |
| GET | `/admin/vendors/:id/activity` | admin | Activity log (from `transactions`). |
| POST | `/vendor/register` | public | Self-signup → `pending`. |

## QR onboarding
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/onboarding/:code` | public | Decode poster code → `{theme, card, vendor, appStoreUrl, playStoreUrl}` for auto-select. |
| GET | `/qr/onboarding.png?vendorId=&cardId=` | public | PNG QR encoding `lrcard://onboard?code=…` + https fallback. |
| GET | `/qr/lookup/:lookupToken.png` | customer | PNG QR of the pass barcode. |

## Health
`GET /api/health` → `{status:"ok", db:true|false}`. `GET /` → `{name, version}`.
