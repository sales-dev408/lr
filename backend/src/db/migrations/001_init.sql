DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pgcrypto extension not available; gen_random_uuid() may require it preinstalled';
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS citext;
EXCEPTION
  WHEN insufficient_privilege OR undefined_file OR syntax_error_or_access_rule_violation THEN
    RAISE NOTICE 'citext extension unavailable, falling back to text unique indexes';
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NULL,
  phone text NULL,
  password_hash text NULL,
  social_provider text NULL,
  social_id text NULL,
  full_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users ((lower(email::text))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NULL,
  city text NULL,
  category text NULL,
  pos_type text NOT NULL CHECK (pos_type IN ('square', 'stripe', 'clover', 'toast', 'other')),
  email citext NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_email_unique_idx ON vendors ((lower(email::text)));

CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'analyst')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique_idx ON admins ((lower(email::text)));

CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  theme text NOT NULL CHECK (theme IN ('sports', 'entertainment', 'shops_restaurants')),
  description text NULL,
  image_url text NULL,
  expiration_date timestamptz NULL,
  max_uses int NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS card_vendors (
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('fixed', 'percent', 'bogo')),
  value numeric NOT NULL DEFAULT 0,
  min_purchase numeric NOT NULL DEFAULT 0,
  max_uses_total int NULL,
  max_uses_per_customer int NULL,
  uses_count int NOT NULL DEFAULT 0,
  city_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('apple', 'google')),
  serial_number text NOT NULL UNIQUE,
  auth_token text NOT NULL,
  lookup_token text NOT NULL UNIQUE,
  device_library_id text NULL,
  push_token text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id uuid NULL REFERENCES cards(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id uuid NULL REFERENCES discounts(id) ON DELETE SET NULL,
  gift_card_id uuid NULL REFERENCES gift_cards(id) ON DELETE SET NULL,
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  pass_id uuid NULL REFERENCES passes(id) ON DELETE SET NULL,
  amount_applied numeric NOT NULL DEFAULT 0,
  city text NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'denied')),
  reason text NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS redemptions_vendor_redeemed_at_idx ON redemptions (vendor_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS redemptions_card_idx ON redemptions (card_id);
CREATE INDEX IF NOT EXISTS redemptions_user_idx ON redemptions (user_id);
CREATE INDEX IF NOT EXISTS redemptions_redeemed_at_idx ON redemptions (redeemed_at DESC);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'vendor', 'customer', 'system')),
  actor_id uuid NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_entity_idx ON transactions (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions (created_at DESC);
