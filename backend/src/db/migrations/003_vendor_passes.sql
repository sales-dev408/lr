CREATE TABLE IF NOT EXISTS vendor_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_type text NOT NULL,
  discount_amount numeric NOT NULL,
  discount_code text NOT NULL UNIQUE,
  icon_png text,
  logo_png text,
  pkpass_base64 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discount_type, discount_amount)
);

DROP INDEX IF EXISTS vendors_email_unique_idx;

ALTER TABLE vendors
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS password_hash,
  DROP CONSTRAINT IF EXISTS vendors_pos_type_check,
  ALTER COLUMN pos_type TYPE text,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric,
  ADD COLUMN IF NOT EXISTS vendor_pass_id uuid REFERENCES vendor_passes(id);
