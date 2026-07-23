import { withDbClient } from './db.ts';
import { generateOpaqueToken } from './ids.ts';
import { getMembershipCardId } from './vendors.ts';
import { createPass as createPasscreatorPass, passcreatorConfigured } from './passcreator.ts';

export interface MembershipPass {
  id: string;
  user_id: string;
  serial_number: string;
  lookup_token: string;
  auth_token: string;
  card_id: string;
  platform: string;
  barcode_value: string | null;
  passcreator_id: string | null;
  passcreator_url: string | null;
  passcreator_iphone_uri: string | null;
  passcreator_android_uri: string | null;
}

const PASS_COLUMNS = `id, user_id, serial_number, lookup_token, auth_token, card_id, platform,
  barcode_value, passcreator_id, passcreator_url, passcreator_iphone_uri, passcreator_android_uri`;

// Idempotently returns the user's single membership pass, creating the DB row
// and the hosted Passcreator pass on first use. Called right after signup so a
// pass is auto-generated for every user, and lazily whenever the pass is read.
export async function ensureMembershipPass(userId: string, opts?: { platform?: 'apple' | 'google' }): Promise<MembershipPass> {
  return withDbClient(async (client) => {
    const membership = await getMembershipCardId(client);

    const existing = await client.query<MembershipPass>(
      `SELECT ${PASS_COLUMNS} FROM passes WHERE user_id = $1 AND card_id = $2 ORDER BY created_at ASC LIMIT 1`,
      [userId, membership.id],
    );
    let pass = existing.rows[0];

    if (!pass) {
      const serial = generateOpaqueToken(12);
      const lookup = generateOpaqueToken(18);
      const authToken = generateOpaqueToken(18);
      const inserted = await client.query<MembershipPass>(
        `INSERT INTO passes (user_id, card_id, platform, serial_number, auth_token, lookup_token, barcode_value)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING ${PASS_COLUMNS}`,
        [userId, membership.id, opts?.platform ?? 'apple', serial, authToken, lookup],
      );
      pass = inserted.rows[0]!;
    }

    if (!pass.passcreator_id && passcreatorConfigured()) {
      try {
        const created = await createPasscreatorPass({
          userProvidedId: pass.serial_number,
          barcodeValue: pass.barcode_value ?? pass.lookup_token,
        });
        const updated = await client.query<MembershipPass>(
          `UPDATE passes SET passcreator_id = $2, passcreator_url = $3, passcreator_iphone_uri = $4, passcreator_android_uri = $5, updated_at = now()
           WHERE id = $1 RETURNING ${PASS_COLUMNS}`,
          [pass.id, created.identifier || null, created.downloadPage || null, created.iPhoneUri || null, created.androidUri ?? null],
        );
        pass = updated.rows[0]!;
      } catch {
        // Best effort: keep the DB pass; hosted URLs can be generated on a later read.
      }
    }

    return pass!;
  });
}

// The URL a client should open to add the pass to a wallet. Prefers the direct
// Apple Wallet .pkpass link, then the hosted download page.
export function membershipWalletUrl(pass: MembershipPass): string | null {
  return pass.passcreator_iphone_uri || pass.passcreator_url || null;
}
