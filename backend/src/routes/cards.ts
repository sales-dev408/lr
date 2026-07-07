import type { FastifyInstance } from 'fastify';
import { dbQuery } from '../db/pool.js';
import { buildLookupDiscountView } from '../services/discounts.js';

export async function registerCardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/cards', async (request) => {
    const theme = typeof request.query === 'object' && request.query && 'theme' in request.query ? String((request.query as { theme?: string }).theme ?? '') : '';
    const city = typeof request.query === 'object' && request.query && 'city' in request.query ? String((request.query as { city?: string }).city ?? '') : '';

    const cards = await dbQuery<{
      id: string;
      name: string;
      theme: string;
      description: string | null;
      image_url: string | null;
      expiration_date: string | null;
      max_uses: number | null;
      status: string;
    }>(
      `
        SELECT *
        FROM cards
        WHERE status = 'active'
          AND ($1 = '' OR theme = $1)
        ORDER BY created_at DESC
      `,
      [theme],
    );

    const cardIds = cards.map((card) => card.id);
    const vendors = cardIds.length
      ? await dbQuery<{
          card_id: string;
          vendor_id: string;
          vendor_name: string;
          vendor_city: string | null;
          discount_id: string;
          discount_type: 'fixed' | 'percent' | 'bogo';
          discount_value: string;
          min_purchase: string;
          city_overrides: Record<string, { type?: 'fixed' | 'percent' | 'bogo'; value?: number }> | null;
          active: boolean;
        }>(
          `
            SELECT cv.card_id,
                   v.id AS vendor_id,
                   v.name AS vendor_name,
                   v.city AS vendor_city,
                   d.id AS discount_id,
                   d.type AS discount_type,
                   d.value AS discount_value,
                   d.min_purchase,
                   d.city_overrides,
                   d.active
            FROM card_vendors cv
            JOIN vendors v ON v.id = cv.vendor_id
            LEFT JOIN discounts d ON d.card_id = cv.card_id AND d.vendor_id = cv.vendor_id
            WHERE cv.card_id = ANY($1::uuid[])
            ORDER BY v.name
          `,
          [cardIds],
        )
      : [];

    const grouped = cards.map((card) => {
      const participating = vendors.filter((vendor) => vendor.card_id === card.id).map((vendor) => {
        const discount = vendor.discount_id
          ? buildLookupDiscountView(
              {
                id: vendor.discount_id,
                cardId: card.id,
                vendorId: vendor.vendor_id,
                type: vendor.discount_type,
                value: vendor.discount_value,
                minPurchase: vendor.min_purchase,
                maxUsesTotal: null,
                maxUsesPerCustomer: null,
                usesCount: 0,
                cityOverrides: vendor.city_overrides,
                active: vendor.active,
              },
              city || null,
            )
          : null;

        return {
          id: vendor.vendor_id,
          name: vendor.vendor_name,
          city: vendor.vendor_city,
          discount,
        };
      });

      return {
        ...card,
        participatingBusinesses: participating,
      };
    });

    return grouped;
  });

  fastify.get('/api/cards/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const cards = await dbQuery('SELECT * FROM cards WHERE id = $1 LIMIT 1', [id]);
    if (cards.length === 0) {
      return reply.code(404).send({ error: 'Card not found' });
    }

    const vendors = await dbQuery(
      `
        SELECT v.id, v.name, v.city, d.*
        FROM card_vendors cv
        JOIN vendors v ON v.id = cv.vendor_id
        LEFT JOIN discounts d ON d.card_id = cv.card_id AND d.vendor_id = cv.vendor_id
        WHERE cv.card_id = $1
      `,
      [id],
    );

    return { ...(cards[0] as Record<string, unknown>), participatingBusinesses: vendors };
  });
}
