import type { FastifyInstance } from 'fastify';
import { dbQuery } from '../db/pool.js';
import { config } from '../config.js';

export async function registerVendorPublicRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/vendors', async (request) => {
    const query = request.query as { category?: string };
    const rows = await dbQuery(
      `
        SELECT v.id, v.name, v.location, v.category, v.pos_type, v.discount_type, v.discount_amount,
               vp.id AS pass_id, vp.discount_code
        FROM vendors v
        LEFT JOIN vendor_passes vp ON vp.id = v.vendor_pass_id
        WHERE v.status = 'approved'
          AND ($1::text IS NULL OR v.category = $1)
        ORDER BY v.name
      `,
      [query.category ?? null],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location,
      category: row.category,
      posType: row.pos_type,
      discountType: row.discount_type,
      discountAmount: Number(row.discount_amount ?? 0),
      passId: row.pass_id,
      passUrl: row.pass_id ? `${getBaseUrl()}/api/vendor-passes/${row.pass_id}.pkpass` : null,
    }));
  });

  fastify.get('/api/vendors/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const rows = await dbQuery(
      `
        SELECT v.id, v.name, v.location, v.category, v.pos_type, v.discount_type, v.discount_amount,
               vp.id AS pass_id, vp.discount_code
        FROM vendors v
        LEFT JOIN vendor_passes vp ON vp.id = v.vendor_pass_id
        WHERE v.id = $1
        LIMIT 1
      `,
      [id],
    );
    const row = rows[0];
    if (!row) {
      return reply.code(404).send({ error: 'Vendor not found' });
    }
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      category: row.category,
      posType: row.pos_type,
      discountType: row.discount_type,
      discountAmount: Number(row.discount_amount ?? 0),
      passId: row.pass_id,
      passUrl: row.pass_id ? `${getBaseUrl()}/api/vendor-passes/${row.pass_id}.pkpass` : null,
    };
  });
}

function getBaseUrl(): string {
  return (config.baseUrl || '').replace(/\/$/, '');
}
