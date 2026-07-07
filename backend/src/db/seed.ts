import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { withDbClient, closePool } from './pool.js';
import { generateOpaqueToken } from '../utils/ids.js';

async function main(): Promise<void> {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

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

      const vendorSeed = [
        { name: 'Sunrise Sports Bar', location: '101 E Main St', city: 'Phoenix', category: 'sports bar', pos_type: 'square', email: 'sunrise@example.com', status: 'approved' },
        { name: 'Tempe Treats', location: '202 Mill Ave', city: 'Tempe', category: 'dessert', pos_type: 'stripe', email: 'tempe@example.com', status: 'approved' },
        { name: 'Scottsdale Shops', location: '303 Scottsdale Rd', city: 'Scottsdale', category: 'retail', pos_type: 'clover', email: 'scottsdale@example.com', status: 'approved' },
        { name: 'Valley Toast Co.', location: '404 Central Ave', city: 'Phoenix', category: 'cafe', pos_type: 'toast', email: 'toast@example.com', status: 'pending' },
      ] as const;

      const vendorIds: string[] = [];
      for (const vendor of vendorSeed) {
        const passwordHash = await bcrypt.hash('Vendor123!', 10);
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO vendors (name, location, city, category, pos_type, email, password_hash, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
          `,
          [vendor.name, vendor.location, vendor.city, vendor.category, vendor.pos_type, vendor.email, passwordHash, vendor.status],
        );
        vendorIds.push(inserted.rows[0]!.id);
      }

      const cards = [
        { name: 'Play Pass', theme: 'sports', description: 'Sports and game savings', status: 'active' },
        { name: 'Night Out Card', theme: 'entertainment', description: 'Dining and entertainment', status: 'active' },
        { name: 'Local Favorites', theme: 'shops_restaurants', description: 'Shops and restaurants around town', status: 'active' },
      ] as const;

      const cardIds: string[] = [];
      for (const card of cards) {
        const inserted = await client.query<{ id: string }>(
          'INSERT INTO cards (name, theme, description, status) VALUES ($1, $2, $3, $4) RETURNING id',
          [card.name, card.theme, card.description, card.status],
        );
        cardIds.push(inserted.rows[0]!.id);
      }

      const links: Array<[string, string]> = [
        [cardIds[0]!, vendorIds[0]!],
        [cardIds[0]!, vendorIds[3]!],
        [cardIds[1]!, vendorIds[1]!],
        [cardIds[1]!, vendorIds[2]!],
        [cardIds[2]!, vendorIds[0]!],
        [cardIds[2]!, vendorIds[1]!],
        [cardIds[2]!, vendorIds[2]!],
      ];
      for (const [cardId, vendorId] of links) {
        await client.query('INSERT INTO card_vendors (card_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cardId, vendorId]);
      }

      const discountRows = [
        { cardId: cardIds[0]!, vendorId: vendorIds[0]!, type: 'percent', value: 15, cityOverrides: { Tempe: { value: 20 } } },
        { cardId: cardIds[0]!, vendorId: vendorIds[3]!, type: 'fixed', value: 5, cityOverrides: { Phoenix: { type: 'fixed', value: 7 } } },
        { cardId: cardIds[1]!, vendorId: vendorIds[1]!, type: 'bogo', value: 0, cityOverrides: {} },
        { cardId: cardIds[1]!, vendorId: vendorIds[2]!, type: 'fixed', value: 10, cityOverrides: {} },
        { cardId: cardIds[2]!, vendorId: vendorIds[0]!, type: 'fixed', value: 8, cityOverrides: {} },
        { cardId: cardIds[2]!, vendorId: vendorIds[1]!, type: 'percent', value: 12, cityOverrides: { Scottsdale: { value: 18 } } },
        { cardId: cardIds[2]!, vendorId: vendorIds[2]!, type: 'percent', value: 20, cityOverrides: {} },
      ] as const;
      for (const discount of discountRows) {
        await client.query(
          `
            INSERT INTO discounts (card_id, vendor_id, type, value, min_purchase, city_overrides, active)
            VALUES ($1, $2, $3, $4, 0, $5::jsonb, true)
            ON CONFLICT (card_id, vendor_id) DO NOTHING
          `,
          [discount.cardId, discount.vendorId, discount.type, discount.value, JSON.stringify(discount.cityOverrides)],
        );
      }

      const customer1Hash = await bcrypt.hash('Customer123!', 10);
      const customer2Hash = await bcrypt.hash('Customer123!', 10);
      const users = await Promise.all([
        client.query<{ id: string }>(
          'INSERT INTO users (email, password_hash, full_name, status) VALUES ($1, $2, $3, \'active\') RETURNING id',
          ['jane@example.com', customer1Hash, 'Jane Customer'],
        ),
        client.query<{ id: string }>(
          'INSERT INTO users (email, password_hash, full_name, status) VALUES ($1, $2, $3, \'active\') RETURNING id',
          ['john@example.com', customer2Hash, 'John Customer'],
        ),
      ]);

      const passes = [
        { userId: users[0].rows[0]!.id, cardId: cardIds[0]!, platform: 'apple' as const },
        { userId: users[1].rows[0]!.id, cardId: cardIds[2]!, platform: 'google' as const },
      ];
      const passRows: Array<{ id: string; lookup_token: string }> = [];
      for (const pass of passes) {
        const serialNumber = generateOpaqueToken(12);
        const lookupToken = generateOpaqueToken(18);
        const authToken = generateOpaqueToken(18);
        const inserted = await client.query<{ id: string; lookup_token: string }>(
          `
            INSERT INTO passes (user_id, card_id, platform, serial_number, auth_token, lookup_token)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, lookup_token
          `,
          [pass.userId, pass.cardId, pass.platform, serialNumber, authToken, lookupToken],
        );
        passRows.push(inserted.rows[0]!);
      }

      await client.query(
        `
          INSERT INTO redemptions (discount_id, card_id, vendor_id, user_id, pass_id, amount_applied, city, status, redeemed_at)
          VALUES ($1, $2, $3, $4, $5, 12, 'Phoenix', 'approved', now() - interval '5 days')
        `,
        [null, cardIds[0]!, vendorIds[0]!, users[0].rows[0]!.id, passRows[0]!.id],
      );
      await client.query(
        `
          INSERT INTO redemptions (discount_id, card_id, vendor_id, user_id, pass_id, amount_applied, city, status, redeemed_at)
          VALUES ($1, $2, $3, $4, $5, 8, 'Scottsdale', 'approved', now() - interval '2 days')
        `,
        [null, cardIds[2]!, vendorIds[2]!, users[1].rows[0]!.id, passRows[1]!.id],
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
