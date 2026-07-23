import { withDbClient, type PoolClient } from './db.ts';
import { generateDiscountCode, humanDiscountLabel, type DiscountType } from './codes.ts';
import { uploadImageDataUrl } from './storage.ts';

export type VendorCategory = 'Sports' | 'Dining' | 'Entertainment';

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
  discount: { id: string; type: DiscountType; value: number; label: string };
  membershipCard: { id: string; name: string };
  posInstructions: string;
}

function posInstructions(code: string, label: string, posSystem: string | null): string {
  const system = posSystem ? ` (${posSystem})` : '';
  return [
    `Activate the "${label}" member discount in your point-of-sale system${system}:`,
    '1. Ask the customer to show their Light Rail membership pass and scan its barcode (or check the participating-business list in the app).',
    `2. Apply this discount using code ${code}.`,
    '3. No NFC or special hardware is required — any barcode scanner or manual keypad works.',
  ].join('\n');
}

// Returns the id of the singleton membership card, creating it if needed.
export async function getMembershipCardId(client: PoolClient): Promise<{ id: string; name: string }> {
  const existing = await client.query<{ id: string; name: string }>('SELECT id, name FROM cards WHERE is_membership = true LIMIT 1');
  if (existing.rows[0]) return existing.rows[0];
  const created = await client.query<{ id: string; name: string }>(
    `INSERT INTO cards (name, theme, description, status, is_membership)
     VALUES ('Light Rail Membership', 'shops_restaurants', 'Your all-in-one membership card. Show it at any participating business for member discounts.', 'active', true)
     RETURNING id, name`,
  );
  return created.rows[0]!;
}

// "Add a vendor" workflow for the membership model: creates the vendor, attaches
// its exclusive discount to the single membership card, and generates a
// POS-friendly discount code. No per-vendor wallet pass is created — every
// member carries one membership pass that unlocks all vendor discounts.
export async function createVendorWithDiscount(input: CreateVendorInput): Promise<CreateVendorResult> {
  const label = humanDiscountLabel(input.discountType, input.discountValue);

  return await withDbClient(async (client: PoolClient) => {
    await client.query('BEGIN');
    try {
      const vendorRows = await client.query<{ id: string }>(
        `INSERT INTO vendors (name, location, address, city, category, pos_type, pos_system, email, password_hash, status)
         VALUES ($1, $2, $3, NULL, $4, 'other', $5, NULL, NULL, 'approved') RETURNING id`,
        [input.name, input.address ?? null, input.address ?? null, input.category, input.posSystem ?? null],
      );
      const vendorId = vendorRows.rows[0]!.id;

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

      const membership = await getMembershipCardId(client);
      const discountCode = generateDiscountCode({ merchantId: input.name || vendorId, type: input.discountType, value: input.discountValue });

      await client.query('INSERT INTO card_vendors (card_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [membership.id, vendorId]);
      const discountRows = await client.query<{ id: string }>(
        `INSERT INTO discounts (card_id, vendor_id, type, value, discount_code, description, active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (card_id, vendor_id) DO UPDATE SET type = EXCLUDED.type, value = EXCLUDED.value, discount_code = COALESCE(discounts.discount_code, EXCLUDED.discount_code), description = EXCLUDED.description, active = true, updated_at = now()
         RETURNING id`,
        [membership.id, vendorId, input.discountType, input.discountValue, discountCode, `${label} member discount`],
      );
      const discountId = discountRows.rows[0]!.id;

      await client.query(
        `INSERT INTO transactions (actor_type, action, entity_type, entity_id, metadata)
         VALUES ('admin', 'admin.vendor.create', 'vendor', $1, $2::jsonb)`,
        [vendorId, JSON.stringify({ name: input.name, discountCode, membershipCardId: membership.id })],
      );

      await client.query('COMMIT');

      return {
        vendor: { id: vendorId, name: input.name, address: input.address ?? null, category: input.category, posSystem: input.posSystem ?? null },
        discountCode,
        discount: { id: discountId, type: input.discountType, value: input.discountValue, label },
        membershipCard: { id: membership.id, name: membership.name },
        posInstructions: posInstructions(discountCode, label, input.posSystem ?? null),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}
