import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { dbQuery, withDbClient } from '../db/pool.js';
import { verifyCaptcha } from '../services/captcha.js';
import { signJwt } from '../services/jwt.js';
import type { AdminProfile, UserProfile, VendorProfile } from '../types.js';

const customerRegisterSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  password: z.string().min(8),
  fullName: z.string().min(1).default('Customer'),
  socialProvider: z.string().min(1).optional(),
  socialId: z.string().min(1).optional(),
  captchaToken: z.string().optional(),
});

const customerLoginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
});

const socialSchema = z.object({
  provider: z.string().min(1),
  token: z.string().min(1).optional(),
  idToken: z.string().min(1).optional(),
  email: z.string().email().optional(),
  fullName: z.string().min(1).default('Social User'),
}).refine((value) => Boolean(value.token || value.idToken), {
  message: 'token or idToken is required',
});

const vendorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
});

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
});

async function buildCustomerProfile(userId: string): Promise<UserProfile | null> {
  const rows = await dbQuery<UserProfile>(
    'SELECT id, email::text AS email, phone, full_name AS "fullName", status FROM users WHERE id = $1 LIMIT 1',
    [userId],
  );
  return rows[0] ?? null;
}

async function issueProfileToken(role: 'customer' | 'vendor' | 'admin', id: string, email?: string | null) {
  return signJwt({ sub: id, role, email: email ?? null });
}

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/auth/register', async (request, reply) => {
    const body = customerRegisterSchema.parse(request.body);
    if (!(await verifyCaptcha(body.captchaToken))) {
      return reply.code(400).send({ error: 'CAPTCHA failed' });
    }

    if (!body.email && !body.phone && !body.socialProvider) {
      return reply.code(400).send({ error: 'Email, phone, or social login is required' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const rows = await withDbClient(async (client) => {
      await client.query('BEGIN');
      try {
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO users (email, phone, password_hash, social_provider, social_id, full_name)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `,
          [body.email ?? null, body.phone ?? null, passwordHash, body.socialProvider ?? null, body.socialId ?? null, body.fullName],
        );
        await client.query('COMMIT');
        return result.rows;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    const profile = await buildCustomerProfile(rows[0]!.id);
    const token = await issueProfileToken('customer', rows[0]!.id, profile?.email ?? body.email ?? null);
    return reply.code(201).send({ token, expiresIn: '7d', profile });
  });

  fastify.post('/api/auth/login', async (request, reply) => {
    const body = customerLoginSchema.parse(request.body);
    if (!(await verifyCaptcha(body.captchaToken))) {
      return reply.code(400).send({ error: 'CAPTCHA failed' });
    }

    const rows = await dbQuery<{
      id: string;
      email: string | null;
      phone: string | null;
      password_hash: string | null;
      status: string;
      full_name: string;
    }>(
      `
        SELECT id, email::text AS email, phone, password_hash, status, full_name
        FROM users
        WHERE (email::text = $1 OR phone = $2)
        LIMIT 1
      `,
      [body.email ?? null, body.phone ?? null],
    );

    const user = rows[0];
    if (!user || !user.password_hash) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const profile = await buildCustomerProfile(user.id);
    const token = await issueProfileToken('customer', user.id, user.email);
    return reply.send({ token, expiresIn: '7d', profile });
  });

  fastify.post('/api/auth/social', async (request, reply) => {
    const body = socialSchema.parse(request.body);
    const socialToken = body.token ?? body.idToken ?? '';
    const socialId = `${body.provider}:${socialToken}`;
    const rows = await withDbClient(async (client) => {
      await client.query('BEGIN');
      try {
        const existing = await client.query<{ id: string; email: string | null; full_name: string }>(
          'SELECT id, email::text AS email, full_name FROM users WHERE social_provider = $1 AND social_id = $2 LIMIT 1',
          [body.provider, socialId],
        );
        if (existing.rows[0]) {
          await client.query('COMMIT');
          return existing.rows[0]!;
        }

        const created = await client.query<{ id: string }>(
          `
            INSERT INTO users (email, password_hash, social_provider, social_id, full_name)
            VALUES ($1, NULL, $2, $3, $4)
            RETURNING id
          `,
          [body.email ?? null, body.provider, socialId, body.fullName],
        );
        await client.query('COMMIT');
        return { id: created.rows[0]!.id, email: body.email ?? null, full_name: body.fullName };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    const token = await issueProfileToken('customer', rows.id, rows.email);
    const profile = await buildCustomerProfile(rows.id);
    return reply.send({ token, expiresIn: '7d', profile });
  });

  fastify.post('/api/auth/vendor/login', async (request, reply) => {
    const body = vendorLoginSchema.parse(request.body);
    if (!(await verifyCaptcha(body.captchaToken))) {
      return reply.code(400).send({ error: 'CAPTCHA failed' });
    }

    const rows = await dbQuery<{
      id: string;
      email: string;
      password_hash: string;
      status: string;
      name: string;
      location: string | null;
      city: string | null;
      category: string | null;
      pos_type: string;
    }>(
      'SELECT * FROM vendors WHERE email::text = $1 LIMIT 1',
      [body.email],
    );

    const vendor = rows[0];
    if (!vendor || !(await bcrypt.compare(body.password, vendor.password_hash))) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = await issueProfileToken('vendor', vendor.id, vendor.email);
    const profile: VendorProfile = {
      id: vendor.id,
      email: vendor.email,
      name: vendor.name,
      location: vendor.location,
      city: vendor.city,
      category: vendor.category,
      posType: vendor.pos_type as VendorProfile['posType'],
      status: vendor.status as VendorProfile['status'],
    };
    return reply.send({ token, expiresIn: '7d', profile });
  });

  fastify.post('/api/auth/admin/login', async (request, reply) => {
    const body = adminLoginSchema.parse(request.body);
    if (!(await verifyCaptcha(body.captchaToken))) {
      return reply.code(400).send({ error: 'CAPTCHA failed' });
    }

    const rows = await dbQuery<{
      id: string;
      email: string;
      password_hash: string;
      role: string;
    }>('SELECT id, email::text AS email, password_hash, role FROM admins WHERE email::text = $1 LIMIT 1', [body.email]);

    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(body.password, admin.password_hash))) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = await issueProfileToken('admin', admin.id, admin.email);
    const profile: AdminProfile = { id: admin.id, email: admin.email, role: admin.role as AdminProfile['role'] };
    return reply.send({ token, expiresIn: '7d', profile });
  });
}
