-- All-in-one membership card model.
--
-- The product moves from one wallet pass per vendor/discount tier to a SINGLE
-- membership card. Every vendor's exclusive discount is attached to that one
-- card. Each app user gets one auto-generated membership pass whose barcode is
-- their opaque lookup token; a participating business scans that token and the
-- vendor's discount is applied.

-- 1) Flag the singleton membership card and enforce there is only one.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_membership boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS cards_single_membership_idx ON cards ((true)) WHERE is_membership;

-- 2) Per-vendor POS discount code + description now live on the discount row
--    (previously the code lived on the per-tier card).
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS discount_code text NULL;
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS description text NULL;
CREATE UNIQUE INDEX IF NOT EXISTS discounts_discount_code_unique_idx ON discounts (discount_code) WHERE discount_code IS NOT NULL;

-- 3) Passcreator-hosted membership pass metadata on each user's pass.
ALTER TABLE passes ADD COLUMN IF NOT EXISTS passcreator_id text NULL;
ALTER TABLE passes ADD COLUMN IF NOT EXISTS passcreator_url text NULL;
ALTER TABLE passes ADD COLUMN IF NOT EXISTS passcreator_iphone_uri text NULL;
ALTER TABLE passes ADD COLUMN IF NOT EXISTS passcreator_android_uri text NULL;
ALTER TABLE passes ADD COLUMN IF NOT EXISTS barcode_value text NULL;

DO $$
DECLARE
  v_membership_id uuid;
BEGIN
  -- 4) Ensure exactly one membership card exists (reuse an existing one if present).
  SELECT id INTO v_membership_id FROM cards WHERE is_membership = true LIMIT 1;
  IF v_membership_id IS NULL THEN
    INSERT INTO cards (name, theme, description, status, is_membership)
    VALUES ('Light Rail Membership', 'shops_restaurants', 'Your all-in-one membership card. Show it at any participating business for member discounts.', 'active', true)
    RETURNING id INTO v_membership_id;
  END IF;

  -- 5) Migrate existing vendor links onto the membership card.
  INSERT INTO card_vendors (card_id, vendor_id)
  SELECT v_membership_id, cv.vendor_id
  FROM card_vendors cv
  WHERE cv.card_id <> v_membership_id
  ON CONFLICT DO NOTHING;

  -- 6) Migrate existing discounts onto the membership card where it doesn't
  --    collide with an already-migrated discount for the same vendor.
  UPDATE discounts d
  SET card_id = v_membership_id
  WHERE d.card_id <> v_membership_id
    AND NOT EXISTS (
      SELECT 1 FROM discounts d2
      WHERE d2.card_id = v_membership_id AND d2.vendor_id = d.vendor_id AND d2.id <> d.id
    );

  -- 7) Backfill a per-vendor POS discount code for discounts that lack one.
  UPDATE discounts d
  SET discount_code = 'MBR-' || upper(substr(replace(d.id::text, '-', ''), 1, 10))
  WHERE d.discount_code IS NULL;

  -- 8) Archive the now-empty legacy tier cards so only the membership card is
  --    surfaced to the app.
  UPDATE cards
  SET status = 'archived', updated_at = now()
  WHERE is_membership = false AND status = 'active';
END $$;
