-- Discount-tier / vendor workflow: shared discount cards carry a POS-friendly
-- discount code + Apple Wallet pass, and vendors no longer need login accounts.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address text NULL;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pos_system text NULL;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS icon_url text NULL;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS logo_url text NULL;
ALTER TABLE vendors ALTER COLUMN email DROP NOT NULL;
ALTER TABLE vendors ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE cards ADD COLUMN IF NOT EXISTS discount_type text NULL CHECK (discount_type IN ('fixed', 'percent', 'bogo'));
ALTER TABLE cards ADD COLUMN IF NOT EXISTS discount_value numeric NULL;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS discount_code text NULL;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS pkpass_pass_id text NULL;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS pkpass_url text NULL;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS icon_url text NULL;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS logo_url text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cards_discount_code_unique_idx ON cards (discount_code) WHERE discount_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS cards_discount_tier_idx ON cards (discount_type, discount_value) WHERE status = 'active';

-- Admin self-service settings (username/password handled via existing columns).
ALTER TABLE admins ADD COLUMN IF NOT EXISTS location text NULL;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Example vendor + shared 15% discount tier for testing.
DO $$
DECLARE
  v_card_id uuid;
  v_vendor_id uuid;
BEGIN
  SELECT id INTO v_card_id FROM cards WHERE discount_code = 'VEND-LRDEMO-15PCT-DEMO';
  IF v_card_id IS NULL THEN
    INSERT INTO cards (name, theme, description, discount_type, discount_value, discount_code, status)
    VALUES ('15% Off', 'shops_restaurants', '15% Off discount', 'percent', 15, 'VEND-LRDEMO-15PCT-DEMO', 'active')
    RETURNING id INTO v_card_id;
  END IF;

  SELECT id INTO v_vendor_id FROM vendors WHERE name = 'Downtown Diner (Example)';
  IF v_vendor_id IS NULL THEN
    INSERT INTO vendors (name, location, address, category, pos_type, pos_system, status)
    VALUES ('Downtown Diner (Example)', '100 Central Ave, Phoenix, AZ', '100 Central Ave, Phoenix, AZ', 'Dining', 'other', 'Square', 'approved')
    RETURNING id INTO v_vendor_id;
  END IF;

  INSERT INTO card_vendors (card_id, vendor_id) VALUES (v_card_id, v_vendor_id) ON CONFLICT DO NOTHING;

  INSERT INTO discounts (card_id, vendor_id, type, value, active)
  VALUES (v_card_id, v_vendor_id, 'percent', 15, true)
  ON CONFLICT (card_id, vendor_id) DO NOTHING;
END $$;
