import { withDbClient, type PoolClient } from './db.ts';
import { generateDiscountCode, humanDiscountLabel, type DiscountType } from './codes.ts';
import { uploadImageDataUrl } from './storage.ts';
import { addpassConfigured, generatePkPassJson } from './addpass.ts';
import { buildAddpassPayload, buildPkpassDownloadUrl, buildWalletEmbedHtml } from './wallet.ts';

export type VendorCategory = 'Sports' | 'Dining' | 'Entertainment';
type CardTheme = 'sports' | 'entertainment' | 'shops_restaurants';

export interface CreateVendorInput {
  name: string;
  address?: string | null;
  category: VendorCategory;
  posSystem?: string | null;
  discountType: DiscountType;
  discountValue: number;
  iconDataUrl?: string | null;
  logoDataUrl?: string | null;
}

export interface CreateVendorResult {
  vendor: { id: string; name: string; address: string | null; category: string; posSystem: string | null };
  discountCode: string;
  card: { id: string; name: string; reused: boolean; pkpassHostedUrl: string | null; iconUrl: string | null; logoUrl: string | null };
  wallet: { downloadUrl: string; embedHtml: string };
  posInstructions: string;
}

function themeForCategory(category: VendorCategory): CardTheme {
  if (category === 'Sports') return 'sports';
  if (category === 'Entertainment') return 'entertainment';
  return 'shops_restaurants';
}

function posInstructions(code: string, posSystem: string | null): string {
  const system = posSystem ? ` (${posSystem})` : '';
  return [
    `Activate this discount in your point-of-sale system${system}:`,
    `1. When a customer presents their pass, scan the barcode or manually enter the code: ${code}.`,
    '2. Apply the discount amount shown on the pass to the sale.',
    '3. No NFC or special hardware is required — any barcode scanner or manual keypad works.',
  ].join('\n');
}

interface ExistingCardRow {
  id: string;
  name: string;
  discount_code: string | null;
  pkpass_url: string | null;
  icon_url: string | null;
  logo_url: string | null;
}

// Full "add a vendor" workflow: creates the vendor, reuses or creates the shared
// discount-tier card (dedup by discount type + value), generates the discount
// code + AddPass pkpass for new tiers, and links everything together.
export async function createVendorWithDiscount(input: CreateVendorInput, baseUrl: string): Promise<CreateVendorResult> {
  const label = humanDiscountLabel(input.discountType, input.discountValue);
  const theme = themeForCategory(input.category);

  return await withDbClient(async (client: PoolClient) => {
    await client.query('BEGIN');
    try {
      // 1. Create the vendor (no vendor login accounts in this model).
      const vendorRows = await client.query<{ id: string }>(
        `INSERT INTO vendors (name, location, address, city, category, pos_type, pos_system, email, password_hash, status)
         VALUES ($1, $2, $3, NULL, $4, 'other', $5, NULL, NULL, 'approved') RETURNING id`,
        [input.name, input.address ?? null, input.address ?? null, input.category, input.posSystem ?? null],
      );
      const vendorId = vendorRows.rows[0]!.id;

      // Upload vendor icon/logo (used for the pass images on new tiers).
      let iconUrl: string | null = null;
      let logoUrl: string | null = null;
      try {
        if (input.iconDataUrl) iconUrl = await uploadImageDataUrl(`vendors/${vendorId}/icon.png`, input.iconDataUrl);
        if (input.logoDataUrl) logoUrl = await uploadImageDataUrl(`vendors/${vendorId}/logo.png`, input.logoDataUrl);
      } catch {
        iconUrl = null;
        logoUrl = null;
      }
      if (iconUrl || logoUrl) {
        await client.query('UPDATE vendors SET icon_url = COALESCE($2, icon_url), logo_url = COALESCE($3, logo_url) WHERE id = $1', [vendorId, iconUrl, logoUrl]);
      }

      // 2. Dedup: reuse an existing active card for the same discount tier.
      const existing = await client.query<ExistingCardRow>(
        `SELECT id, name, discount_code, pkpass_url, icon_url, logo_url
         FROM cards
         WHERE status = 'active' AND discount_type = $1 AND discount_value = $2 AND discount_code IS NOT NULL
         ORDER BY created_at ASC LIMIT 1`,
        [input.discountType, input.discountValue],
      );

      let cardId: string;
      let cardName: string;
      let discountCode: string;
      let pkpassHostedUrl: string | null;
      let cardIconUrl: string | null;
      let cardLogoUrl: string | null;
      let reused: boolean;

      if (existing.rows[0]) {
        const card = existing.rows[0];
        cardId = card.id;
        cardName = card.name;
        discountCode = card.discount_code!;
        pkpassHostedUrl = card.pkpass_url;
        cardIconUrl = card.icon_url;
        cardLogoUrl = card.logo_url;
        reused = true;
      } else {
        discountCode = generateDiscountCode({ merchantId: input.name || vendorId, type: input.discountType, value: input.discountValue });
        const created = await client.query<{ id: string }>(
          `INSERT INTO cards (name, theme, description, discount_type, discount_value, discount_code, icon_url, logo_url, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
          [label, theme, `${label} discount`, input.discountType, input.discountValue, discountCode, iconUrl, logoUrl],
        );
        cardId = created.rows[0]!.id;
        cardName = label;
        cardIconUrl = iconUrl;
        cardLogoUrl = logoUrl;
        reused = false;

        // Generate + store the pkpass for the new tier (best effort).
        pkpassHostedUrl = null;
        if (addpassConfigured()) {
          try {
            const result = await generatePkPassJson(
              buildAddpassPayload({ id: cardId, name: cardName, discountType: input.discountType, discountValue: input.discountValue, discountCode, iconUrl: cardIconUrl, logoUrl: cardLogoUrl }),
            );
            pkpassHostedUrl = result.passUrl || null;
            await client.query('UPDATE cards SET pkpass_pass_id = $2, pkpass_url = $3, updated_at = now() WHERE id = $1', [cardId, result.passId || null, pkpassHostedUrl]);
          } catch {
            pkpassHostedUrl = null;
          }
        }
      }

      // 3. Link vendor to the tier card and create the per-vendor discount row.
      await client.query('INSERT INTO card_vendors (card_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cardId, vendorId]);
      await client.query(
        `INSERT INTO discounts (card_id, vendor_id, type, value, active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (card_id, vendor_id) DO UPDATE SET type = EXCLUDED.type, value = EXCLUDED.value, active = true, updated_at = now()`,
        [cardId, vendorId, input.discountType, input.discountValue],
      );

      await client.query(
        `INSERT INTO transactions (actor_type, action, entity_type, entity_id, metadata)
         VALUES ('admin', 'admin.vendor.create', 'vendor', $1, $2::jsonb)`,
        [vendorId, JSON.stringify({ name: input.name, discountCode, cardId, reusedCard: reused })],
      );

      await client.query('COMMIT');

      const downloadUrl = buildPkpassDownloadUrl(baseUrl, cardId);
      return {
        vendor: { id: vendorId, name: input.name, address: input.address ?? null, category: input.category, posSystem: input.posSystem ?? null },
        discountCode,
        card: { id: cardId, name: cardName, reused, pkpassHostedUrl, iconUrl: cardIconUrl, logoUrl: cardLogoUrl },
        wallet: { downloadUrl, embedHtml: buildWalletEmbedHtml(downloadUrl, cardName) },
        posInstructions: posInstructions(discountCode, input.posSystem ?? null),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}
