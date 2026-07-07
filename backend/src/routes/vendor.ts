import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { dbQuery } from '../db/pool.js';
import { getVendorAnalytics } from '../services/analytics.js';

export async function registerVendorRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/vendor/register', async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      location: z.string().optional(),
      city: z.string().optional(),
      category: z.string().optional(),
      posType: z.enum(['square', 'stripe', 'clover', 'toast', 'other']),
      email: z.string().email(),
      password: z.string().min(8),
    });
    const body = schema.parse(request.body);
    const hash = await bcrypt.hash(body.password, 10);
    const rows = await dbQuery<{ id: string }>(
      `
        INSERT INTO vendors (name, location, city, category, pos_type, email, password_hash, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id
      `,
      [body.name, body.location ?? null, body.city ?? null, body.category ?? null, body.posType, body.email, hash],
    );
    return reply.code(201).send({ id: rows[0]!.id, status: 'pending' });
  });

  fastify.patch('/api/vendor/discounts/:id', { preHandler: fastify.requireRole(['vendor']) }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = z
      .object({
        type: z.enum(['fixed', 'percent', 'bogo']).optional(),
        value: z.number().optional(),
        minPurchase: z.number().optional(),
        maxUsesPerCustomer: z.number().int().positive().optional(),
        active: z.boolean().optional(),
        cityOverrides: z.record(z.object({ type: z.enum(['fixed', 'percent', 'bogo']).optional(), value: z.number().optional() })).optional(),
      })
      .parse(request.body);

    const ownership = await dbQuery<{ vendor_id: string }>('SELECT vendor_id FROM discounts WHERE id = $1 LIMIT 1', [id]);
    if (!ownership[0] || ownership[0].vendor_id !== request.user?.sub) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const rows = await dbQuery(
      `
        UPDATE discounts
        SET type = COALESCE($2, type),
            value = COALESCE($3, value),
            min_purchase = COALESCE($4, min_purchase),
            max_uses_per_customer = COALESCE($5, max_uses_per_customer),
            active = COALESCE($6, active),
            city_overrides = COALESCE($7::jsonb, city_overrides),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        body.type ?? null,
        body.value ?? null,
        body.minPurchase ?? null,
        body.maxUsesPerCustomer ?? null,
        body.active ?? null,
        body.cityOverrides ? JSON.stringify(body.cityOverrides) : null,
      ],
    );

    return rows[0] ?? {};
  });

  fastify.get('/api/vendor/analytics', { preHandler: fastify.requireRole(['vendor']) }, async (request) => {
    return getVendorAnalytics(request.user!.sub);
  });
}
