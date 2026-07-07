import { dbQuery } from '../db/pool.js';
import { buildLookupDiscountView } from './discounts.js';
import type { CardRecord, DiscountRule } from '../types.js';

export async function resolvePassLookup(lookupToken: string, vendorId?: string, city?: string | null) {
  const passRows = await dbQuery<{
    pass_id: string;
    user_id: string;
    card_id: string;
    user_email: string | null;
    user_phone: string | null;
    user_full_name: string;
    card_name: string;
    card_theme: string;
    card_description: string | null;
    card_image_url: string | null;
    vendor_id: string | null;
    vendor_name: string | null;
  }>(
    `
      SELECT p.id AS pass_id,
             p.user_id,
             p.card_id,
             u.email AS user_email,
             u.phone AS user_phone,
             u.full_name AS user_full_name,
             c.name AS card_name,
             c.theme AS card_theme,
             c.description AS card_description,
             c.image_url AS card_image_url,
             v.id AS vendor_id,
             v.name AS vendor_name
      FROM passes p
      JOIN users u ON u.id = p.user_id
      JOIN cards c ON c.id = p.card_id
      LEFT JOIN vendors v ON v.id = $2::uuid
      WHERE p.lookup_token = $1
      LIMIT 1
    `,
    [lookupToken, vendorId ?? null],
  );

  if (passRows.length === 0) {
    return null;
  }

  const pass = passRows[0]!;
  const discounts = await dbQuery<DiscountRule>(
    `
      SELECT d.*
      FROM discounts d
      JOIN card_vendors cv ON cv.card_id = d.card_id AND cv.vendor_id = d.vendor_id
      WHERE d.card_id = $1
        AND ($2::uuid IS NULL OR d.vendor_id = $2::uuid)
        AND d.active = true
    `,
    [pass.card_id, vendorId ?? null],
  );

  return {
    pass,
    discounts: discounts.map((discount) => buildLookupDiscountView(discount, city)),
  };
}

export async function resolveCardLookup(cardId: string, vendorId?: string, city?: string | null) {
  const cardRows = await dbQuery<CardRecord & { vendor_name: string | null }>(
    `
      SELECT c.*, v.name AS vendor_name
      FROM cards c
      LEFT JOIN vendors v ON v.id = $2::uuid
      WHERE c.id = $1
      LIMIT 1
    `,
    [cardId, vendorId ?? null],
  );

  if (cardRows.length === 0) {
    return null;
  }

  const card = cardRows[0]!;
  const discounts = await dbQuery<DiscountRule>(
    `
      SELECT d.*
      FROM discounts d
      WHERE d.card_id = $1
        AND ($2::uuid IS NULL OR d.vendor_id = $2::uuid)
        AND d.active = true
    `,
    [cardId, vendorId ?? null],
  );

  return {
    card,
    discounts: discounts.map((discount) => buildLookupDiscountView(discount, city)),
  };
}
