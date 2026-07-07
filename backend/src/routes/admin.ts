import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { dbQuery } from '../db/pool.js';
import { getAdminAnalytics } from '../services/analytics.js';
import { generateTempPassword } from '../utils/ids.js';
import { writeTransactionAudit } from '../services/audit.js';

const cardSchema = z.object({
  name: z.string().min(1),
  theme: z.enum(['sports', 'entertainment', 'shops_restaurants']),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  expirationDate: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

const vendorSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  posType: z.enum(['square', 'stripe', 'clover', 'toast', 'other']),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(),
});

const discountSchema = z.object({
  cardId: z.string().uuid(),
  vendorId: z.string().uuid(),
  type: z.enum(['fixed', 'percent', 'bogo']),
  value: z.number(),
  minPurchase: z.number().default(0),
  maxUsesTotal: z.number().int().positive().optional(),
  maxUsesPerCustomer: z.number().int().positive().optional(),
  cityOverrides: z.record(z.object({ type: z.enum(['fixed', 'percent', 'bogo']).optional(), value: z.number().optional() })).default({}),
  active: z.boolean().default(true),
});

export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/admin/analytics', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const query = request.query as { from?: string; to?: string; city?: string };
    return getAdminAnalytics({
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.city ? { city: query.city } : {}),
    });
  });

  fastify.get('/api/admin/vendors', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const query = request.query as { status?: string; city?: string; category?: string };
    const rows = await dbQuery(
      `
        SELECT *
        FROM vendors
        WHERE ($1::text IS NULL OR status = $1)
          AND ($2::text IS NULL OR city = $2)
          AND ($3::text IS NULL OR category = $3)
        ORDER BY created_at DESC
      `,
      [query.status ?? null, query.city ?? null, query.category ?? null],
    );
    return rows;
  });

  fastify.post('/api/admin/vendors', { preHandler: fastify.requireRole(['admin']) }, async (request, reply) => {
    const body = vendorSchema.parse(request.body);
    const password = body.password ?? generateTempPassword();
    const hash = await bcrypt.hash(password, 10);
    const rows = await dbQuery<{ id: string }>(
      `
        INSERT INTO vendors (name, location, city, category, pos_type, email, password_hash, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [body.name, body.location ?? null, body.city ?? null, body.category ?? null, body.posType, body.email, hash, body.status ?? 'pending'],
    );
    await writeTransactionAudit({
      actorType: 'admin',
      actorId: request.user?.sub ?? null,
      action: 'admin.vendor.create',
      entityType: 'vendor',
      entityId: rows[0]!.id,
      metadata: { name: body.name, email: body.email },
      ip: request.ip,
    });
    return reply.code(201).send({ id: rows[0]!.id, tempPassword: password });
  });

  fastify.patch('/api/admin/vendors/:id', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    const body = vendorSchema.partial().parse(request.body);
    const rows = await dbQuery(
      `
        UPDATE vendors
        SET name = COALESCE($2, name),
            location = COALESCE($3, location),
            city = COALESCE($4, city),
            category = COALESCE($5, category),
            pos_type = COALESCE($6, pos_type),
            email = COALESCE($7, email),
            status = COALESCE($8, status),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [id, body.name ?? null, body.location ?? null, body.city ?? null, body.category ?? null, body.posType ?? null, body.email ?? null, body.status ?? null],
    );
    return rows[0] ?? {};
  });

  fastify.post('/api/admin/vendors/:id/approve', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    return dbQuery('UPDATE vendors SET status = \'approved\', updated_at = now() WHERE id = $1 RETURNING *', [id]);
  });

  fastify.post('/api/admin/vendors/:id/reject', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    return dbQuery('UPDATE vendors SET status = \'rejected\', updated_at = now() WHERE id = $1 RETURNING *', [id]);
  });

  fastify.post('/api/admin/vendors/:id/reset-password', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);
    await dbQuery('UPDATE vendors SET password_hash = $2, updated_at = now() WHERE id = $1', [id, hash]);
    return { tempPassword };
  });

  fastify.get('/api/admin/vendors/:id/activity', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    return dbQuery('SELECT * FROM transactions WHERE entity_type = \'vendor\' AND entity_id = $1 ORDER BY created_at DESC', [id]);
  });

  fastify.post('/api/admin/cards', { preHandler: fastify.requireRole(['admin']) }, async (request, reply) => {
    const body = cardSchema.parse(request.body);
    const rows = await dbQuery<{ id: string }>(
      `
        INSERT INTO cards (name, theme, description, image_url, expiration_date, max_uses, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `,
      [
        body.name,
        body.theme,
        body.description ?? null,
        body.imageUrl ?? null,
        body.expirationDate ?? null,
        body.maxUses ?? null,
        body.status ?? 'draft',
      ],
    );
    return reply.code(201).send({ id: rows[0]!.id });
  });

  fastify.patch('/api/admin/cards/:id', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    const body = cardSchema.partial().parse(request.body);
    const rows = await dbQuery(
      `
        UPDATE cards
        SET name = COALESCE($2, name),
            theme = COALESCE($3, theme),
            description = COALESCE($4, description),
            image_url = COALESCE($5, image_url),
            expiration_date = COALESCE($6, expiration_date),
            max_uses = COALESCE($7, max_uses),
            status = COALESCE($8, status),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [id, body.name ?? null, body.theme ?? null, body.description ?? null, body.imageUrl ?? null, body.expirationDate ?? null, body.maxUses ?? null, body.status ?? null],
    );
    return rows[0] ?? {};
  });

  fastify.delete('/api/admin/cards/:id', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    return dbQuery('DELETE FROM cards WHERE id = $1 RETURNING id', [id]);
  });

  fastify.post('/api/admin/cards/:id/vendors', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    const body = z.object({ vendorId: z.string().uuid() }).parse(request.body);
    return dbQuery('INSERT INTO card_vendors (card_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *', [id, body.vendorId]);
  });

  fastify.delete('/api/admin/cards/:id/vendors/:vendorId', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const params = request.params as { id: string; vendorId: string };
    return dbQuery('DELETE FROM card_vendors WHERE card_id = $1 AND vendor_id = $2 RETURNING *', [params.id, params.vendorId]);
  });

  fastify.post('/api/admin/discounts', { preHandler: fastify.requireRole(['admin']) }, async (request, reply) => {
    const body = discountSchema.parse(request.body);
    const rows = await dbQuery<{ id: string }>(
      `
        INSERT INTO discounts (
          card_id, vendor_id, type, value, min_purchase, max_uses_total, max_uses_per_customer, city_overrides, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        RETURNING id
      `,
      [
        body.cardId,
        body.vendorId,
        body.type,
        body.value,
        body.minPurchase,
        body.maxUsesTotal ?? null,
        body.maxUsesPerCustomer ?? null,
        JSON.stringify(body.cityOverrides),
        body.active,
      ],
    );
    return reply.code(201).send({ id: rows[0]!.id });
  });

  fastify.patch('/api/admin/discounts/:id', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    const body = discountSchema.partial().parse(request.body);
    const rows = await dbQuery(
      `
        UPDATE discounts
        SET card_id = COALESCE($2, card_id),
            vendor_id = COALESCE($3, vendor_id),
            type = COALESCE($4, type),
            value = COALESCE($5, value),
            min_purchase = COALESCE($6, min_purchase),
            max_uses_total = COALESCE($7, max_uses_total),
            max_uses_per_customer = COALESCE($8, max_uses_per_customer),
            city_overrides = COALESCE($9::jsonb, city_overrides),
            active = COALESCE($10, active),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        body.cardId ?? null,
        body.vendorId ?? null,
        body.type ?? null,
        body.value ?? null,
        body.minPurchase ?? null,
        body.maxUsesTotal ?? null,
        body.maxUsesPerCustomer ?? null,
        body.cityOverrides ? JSON.stringify(body.cityOverrides) : null,
        body.active ?? null,
      ],
    );
    return rows[0] ?? {};
  });

  fastify.delete('/api/admin/discounts/:id', { preHandler: fastify.requireRole(['admin']) }, async (request) => {
    const id = (request.params as { id: string }).id;
    return dbQuery('DELETE FROM discounts WHERE id = $1 RETURNING id', [id]);
  });
}
