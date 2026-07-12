import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { withDbClient, closePool } from './pool.js';
import { generateOpaqueToken } from '../utils/ids.js';
import { getOrCreateVendorPass } from '../services/vendorPass.js';

async function main(): Promise<void> {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const exampleVendorPass = config.addpassApiKey
    ? await getOrCreateVendorPass({
        name: 'Light Rail Sports Bar',
        location: '101 E Main St, Phoenix, AZ 85004',
        discountType: 'percent',
        discountAmount: 15,
        iconPng: undefined,
        logoPng: undefined,
      })
    : null;

  await withDbClient(async (client) => {
    await client.query('BEGIN');
    try {
      const existingAdmin = await client.query('SELECT id FROM admins WHERE email::text = $1 LIMIT 1', [config.adminEmail]);
      if (existingAdmin.rows[0]) {
        await client.query('COMMIT');
        return;
      }

      const adminHash = await bcrypt.hash(config.adminPassword, 10);
      await client.query('INSERT INTO admins (email, password_hash, role) VALUES ($1, $2, \'owner\')', [config.adminEmail, adminHash]);

      const cardIds: string[] = [];
      const cards = [
        { name: 'Light Rail Play Pass', theme: 'sports', description: 'Sports and game savings across town', status: 'active' },
        { name: 'Light Rail Night Out Card', theme: 'entertainment', description: 'Dining and entertainment savings', status: 'active' },
      ];
      for (const card of cards) {
        const inserted = await client.query<{ id: string }>(
          'INSERT INTO cards (name, theme, description, status) VALUES ($1, $2, $3, $4) RETURNING id',
          [card.name, card.theme, card.description, card.status],
        );
        cardIds.push(inserted.rows[0]!.id);
      }

      const vendorIds: string[] = [];
      const vendorSeed = [
        { name: 'Light Rail Sports Bar', location: '101 E Main St, Phoenix, AZ 85004', city: 'Phoenix', category: 'Sports', pos_type: 'Square', discount_type: 'percent' as const, discount_amount: 15, status: 'approved' },
      ];

      for (const vendor of vendorSeed) {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO vendors (name, location, city, category, pos_type, discount_type, discount_amount, status, vendor_pass_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
          `,
          [vendor.name, vendor.location, vendor.city, vendor.category, vendor.pos_type, vendor.discount_type, vendor.discount_amount, vendor.status, exampleVendorPass?.vendorPassId ?? null],
        );
        vendorIds.push(inserted.rows[0]!.id);
      }

      for (const cardId of cardIds) {
        await client.query(
          'INSERT INTO card_vendors (card_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [cardId, vendorIds[0]!],
        );

        if (exampleVendorPass) {
          await client.query(
            'INSERT INTO discounts (card_id, vendor_id, type, value, min_purchase, city_overrides, active) VALUES ($1, $2, $3, $4, 0, \'{}\'::jsonb, true) ON CONFLICT (card_id, vendor_id) DO NOTHING',
            [cardId, vendorIds[0]!, 'percent', '15'],
          );
        }
      }

      const customer1Hash = await bcrypt.hash('Customer123!', 10);
      const users = await client.query<{ id: string }>(
        'INSERT INTO users (email, password_hash, full_name, status) VALUES ($1, $2, $3, \'active\') RETURNING id',
        ['jane@example.com', customer1Hash, 'Jane Customer'],
      );

      const serialNumber = generateOpaqueToken(12);
      const lookupToken = generateOpaqueToken(18);
      const authToken = generateOpaqueToken(18);
      const passId = await client.query<{ id: string }>(
        `
          INSERT INTO passes (user_id, card_id, platform, serial_number, auth_token, lookup_token)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `,
        [users.rows[0]!.id, cardIds[0]!, 'apple', serialNumber, authToken, lookupToken],
      );

      await client.query(
        `
          INSERT INTO redemptions (discount_id, card_id, vendor_id, user_id, pass_id, amount_applied, city, status, redeemed_at)
          VALUES ($1, $2, $3, $4, $5, 12, 'Phoenix', 'approved', now() - interval '5 days')
        `,
        [null, cardIds[0]!, vendorIds[0]!, users.rows[0]!.id, passId.rows[0]!.id],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });

  await closePool();
}

void main().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exitCode = 1;
});
