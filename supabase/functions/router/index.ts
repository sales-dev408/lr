import { z } from 'npm:zod';
import bcrypt from 'npm:bcryptjs';
import { Buffer } from 'node:buffer';
import { config } from './lib/config.ts';
import { authenticate, requireRole } from './lib/auth.ts';
import { dbQuery } from './lib/db.ts';
import { getAdminAnalytics } from './lib/analytics.ts';
import { buildLookupDiscountView } from './lib/discounts.ts';
import { generateOpaqueToken } from './lib/ids.ts';
import { resolvePassLookup, resolveCardLookup } from './lib/lookup.ts';
import { redeemDiscount } from './lib/redeem.ts';
import { buildApplePassPackage, buildGoogleWalletLink } from './lib/wallet.ts';
import { writeTransactionAudit } from './lib/audit.ts';
import { getOrCreateVendorPass, getVendorPassById } from './lib/vendorPass.ts';

const customerRegisterSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  password: z.string().min(8),
  fullName: z.string().min(1).default('Customer'),
  socialProvider: z.string().min(1).optional(),
  socialId: z.string().min(1).optional(),
});

const customerLoginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  password: z.string().min(1),
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

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
  location: z.string().min(1),
  category: z.enum(['Sports', 'Dining', 'Entertainment']),
  posType: z.string().min(1),
  discountType: z.enum(['fixed', 'percent']),
  discountAmount: z.number().positive(),
  iconPng: z.string().optional(),
  logoPng: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(),
});

const vendorUpdateSchema = vendorSchema.partial().pick({
  name: true,
  location: true,
  category: true,
  posType: true,
  status: true,
});

const discountSchema = z.object({
  cardId: z.string().uuid(),
  vendorId: z.string().uuid(),
  type: z.enum(['fixed', 'percent', 'bogo']),
  value: z.number(),
  minPurchase: z.number().default(0),
  maxUsesTotal: z.number().int().positive().optional(),
  maxUsesPerCustomer: z.number().int().positive().optional(),
  cityOverrides: z.record(z.string(), z.object({ type: z.enum(['fixed', 'percent', 'bogo']).optional(), value: z.number().optional() })).default({}),
  active: z.boolean().default(true),
});

const adminSettingsSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().optional(),
  location: z.string().optional(),
  password: z.string().min(8).optional(),
});

const createPassSchema = z.object({
  cardId: z.string().uuid(),
  platform: z.enum(['apple', 'google']),
});

function corsOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (!origin) return '*';
  if (config.allowedOrigins.length === 0) return '*';
  return config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0]!;
}

function jsonResponse(request: Request, body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': corsOrigin(request),
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      ...(init.headers ?? {}),
    },
  });
}

function getIp(request: Request): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

function queryObject(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}

async function readJsonBody<T>(request: Request, fallback: T): Promise<T> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return fallback;
  const text = await request.text();
  if (!text) return fallback;
  return JSON.parse(text) as T;
}

async function issueToken(role: 'customer' | 'vendor' | 'admin', id: string, email?: string | null) {
  const { signJwt } = await import('./lib/jwt.ts');
  return signJwt({ sub: id, role, email: email ?? null });
}

async function buildCustomerProfile(userId: string) {
  const rows = await dbQuery<{ id: string; email: string | null; phone: string | null; fullName: string; status: string }>(
    'SELECT id, email::text AS email, phone, full_name AS "fullName", status FROM users WHERE id = $1 LIMIT 1',
    [userId],
  );
  return rows[0] ?? null;
}

function notFound(request: Request): Response {
  return jsonResponse(request, { error: 'Not found' }, { status: 404 });
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let path = url.pathname;

  const m = path.match(/^\/functions\/v1\/router\/(.+)$/);
  if (m) {
    path = `/api/${m[1]}`;
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin(request),
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      },
    });
  }

  if (config.blockedIps.length > 0) {
    const ip = getIp(request);
    if (ip && config.blockedIps.includes(ip)) {
      return jsonResponse(request, { error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    if (path === '/' && request.method === 'GET') {
      return jsonResponse(request, { name: 'Light Rail Deals Backend', version: '0.1.0' });
    }

    if (path === '/api/health' && request.method === 'GET') {
      let db = false;
      try {
        await dbQuery('SELECT 1');
        db = true;
      } catch {
        db = false;
      }
      return jsonResponse(request, { status: 'ok', db });
    }

    if (path === '/api/auth/register' && request.method === 'POST') {
      const body = customerRegisterSchema.parse(await readJsonBody(request, {}));
      if (!body.email && !body.phone && !body.socialProvider) return jsonResponse(request, { error: 'Email, phone, or social login is required' }, { status: 400 });
      const passwordHash = await bcrypt.hash(body.password, 10);
      const rows = await dbQuery<{ id: string }>(
        `INSERT INTO users (email, phone, password_hash, social_provider, social_id, full_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [body.email ?? null, body.phone ?? null, passwordHash, body.socialProvider ?? null, body.socialId ?? null, body.fullName],
      );
      const profile = await buildCustomerProfile(rows[0]!.id);
      const token = await issueToken('customer', rows[0]!.id, profile?.email ?? body.email ?? null);
      return jsonResponse(request, { token, expiresIn: '7d', profile }, { status: 201 });
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
      const body = customerLoginSchema.parse(await readJsonBody(request, {}));
      const rows = await dbQuery<{ id: string; email: string | null; password_hash: string | null }>(
        'SELECT id, email::text AS email, password_hash FROM users WHERE (email::text = $1 OR phone = $2) LIMIT 1',
        [body.email ?? null, body.phone ?? null],
      );
      const user = rows[0];
      if (!user || !user.password_hash || !(await bcrypt.compare(body.password, user.password_hash))) {
        return jsonResponse(request, { error: 'Invalid credentials' }, { status: 401 });
      }
      const profile = await buildCustomerProfile(user.id);
      const token = await issueToken('customer', user.id, user.email);
      return jsonResponse(request, { token, expiresIn: '7d', profile });
    }

    if (path === '/api/auth/social' && request.method === 'POST') {
      const body = socialSchema.parse(await readJsonBody(request, {}));
      const socialToken = body.token ?? body.idToken ?? '';
      const socialId = `${body.provider}:${socialToken}`;
      const rows = await dbQuery<{ id: string; email: string | null }>(
        'SELECT id, email::text AS email FROM users WHERE social_provider = $1 AND social_id = $2 LIMIT 1',
        [body.provider, socialId],
      );
      if (rows[0]) {
        const token = await issueToken('customer', rows[0].id, rows[0].email);
        const profile = await buildCustomerProfile(rows[0].id);
        return jsonResponse(request, { token, expiresIn: '7d', profile });
      }
      const created = await dbQuery<{ id: string }>(
        `INSERT INTO users (email, password_hash, social_provider, social_id, full_name) VALUES ($1, NULL, $2, $3, $4) RETURNING id`,
        [body.email ?? null, body.provider, socialId, body.fullName],
      );
      const token = await issueToken('customer', created[0]!.id, body.email ?? null);
      const profile = await buildCustomerProfile(created[0]!.id);
      return jsonResponse(request, { token, expiresIn: '7d', profile });
    }

    if (path === '/api/auth/admin/login' && request.method === 'POST') {
      const body = adminLoginSchema.parse(await readJsonBody(request, {}));
      const rows = await dbQuery<{ id: string; email: string; password_hash: string; role: string; full_name: string | null; location: string | null }>(
        'SELECT id, email::text AS email, password_hash, role, full_name, location FROM admins WHERE email::text = $1 LIMIT 1',
        [body.email],
      );
      const admin = rows[0];
      if (!admin || !(await bcrypt.compare(body.password, admin.password_hash))) {
        return jsonResponse(request, { error: 'Invalid credentials' }, { status: 401 });
      }
      const token = await issueToken('admin', admin.id, admin.email);
      return jsonResponse(request, { token, expiresIn: '7d', profile: { id: admin.id, email: admin.email, role: admin.role, fullName: admin.full_name, location: admin.location } });
    }

    if (path === '/api/cards' && request.method === 'GET') {
      const theme = url.searchParams.get('theme') ?? '';
      const city = url.searchParams.get('city') ?? '';
      return jsonResponse(request, await loadCardsWithBusinesses({ theme, status: 'active', city }));
    }

    if (/^\/api\/cards\/[^/]+$/.test(path) && request.method === 'GET') {
      const id = path.split('/').pop()!;
      const cards = await dbQuery('SELECT * FROM cards WHERE id = $1 LIMIT 1', [id]);
      if (cards.length === 0) return jsonResponse(request, { error: 'Card not found' }, { status: 404 });
      const vendors = await dbQuery(
        'SELECT v.id, v.name, v.city, d.* FROM card_vendors cv JOIN vendors v ON v.id = cv.vendor_id LEFT JOIN discounts d ON d.card_id = cv.card_id AND d.vendor_id = cv.vendor_id WHERE cv.card_id = $1',
        [id],
      );
      return jsonResponse(request, { ...(cards[0] as Record<string, unknown>), participatingBusinesses: vendors });
    }

    if (path === '/api/vendors' && request.method === 'GET') {
      const category = url.searchParams.get('category') ?? '';
      const rows = await dbQuery(
        `SELECT v.id, v.name, v.location, v.category, v.pos_type, v.discount_type, v.discount_amount, vp.id AS pass_id
         FROM vendors v LEFT JOIN vendor_passes vp ON vp.id = v.vendor_pass_id
         WHERE v.status = 'approved' AND ($1::text IS NULL OR $1 = '' OR v.category = $1) ORDER BY v.name`,
        [category || null],
      );
      return jsonResponse(request, rows.map((row) => ({
        id: row.id,
        name: row.name,
        location: row.location,
        category: row.category,
        posType: row.pos_type,
        discountType: row.discount_type,
        discountAmount: Number(row.discount_amount ?? 0),
        passId: row.pass_id,
        passUrl: row.pass_id ? `${config.baseUrl.replace(/\/$/, '')}/api/vendor-passes/${row.pass_id}.pkpass` : null,
      })));
    }

    if (/^\/api\/vendors\/[^/]+$/.test(path) && request.method === 'GET') {
      const id = path.split('/').pop()!;
      const rows = await dbQuery(
        `SELECT v.id, v.name, v.location, v.category, v.pos_type, v.discount_type, v.discount_amount, vp.id AS pass_id
         FROM vendors v LEFT JOIN vendor_passes vp ON vp.id = v.vendor_pass_id
         WHERE v.id = $1 LIMIT 1`,
        [id],
      );
      const row = rows[0];
      if (!row) return jsonResponse(request, { error: 'Vendor not found' }, { status: 404 });
      return jsonResponse(request, {
        id: row.id,
        name: row.name,
        location: row.location,
        category: row.category,
        posType: row.pos_type,
        discountType: row.discount_type,
        discountAmount: Number(row.discount_amount ?? 0),
        passId: row.pass_id,
        passUrl: row.pass_id ? `${config.baseUrl.replace(/\/$/, '')}/api/vendor-passes/${row.pass_id}.pkpass` : null,
      });
    }

    if (/^\/api\/vendor-passes\/[^/]+\.pkpass$/.test(path) && request.method === 'GET') {
      const id = path.split('/').pop()!.replace('.pkpass', '');
      const pass = await getVendorPassById(id);
      if (!pass || !pass.pkpass_base64) return jsonResponse(request, { error: 'Pass not found' }, { status: 404 });
      const buffer = Buffer.from(pass.pkpass_base64, 'base64');
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="${pass.discount_code}.pkpass"`,
          'Access-Control-Allow-Origin': corsOrigin(request),
        },
      });
    }

    if (/^\/api\/vendor-passes\/[^/]+\/icon\.png$/.test(path) && request.method === 'GET') {
      const parts = path.split('/');
      const id = parts[parts.length - 2]!;
      const pass = await getVendorPassById(id);
      const base64 = pass?.icon_png ?? '';
      if (!base64) return jsonResponse(request, { error: 'Icon not found' }, { status: 404 });
      const buffer = Buffer.from(base64, 'base64');
      return new Response(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': corsOrigin(request),
        },
      });
    }

    if (/^\/api\/vendor-passes\/[^/]+\/logo\.png$/.test(path) && request.method === 'GET') {
      const parts = path.split('/');
      const id = parts[parts.length - 2]!;
      const pass = await getVendorPassById(id);
      const base64 = pass?.logo_png ?? '';
      if (!base64) return jsonResponse(request, { error: 'Logo not found' }, { status: 404 });
      const buffer = Buffer.from(base64, 'base64');
      return new Response(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': corsOrigin(request),
        },
      });
    }

    if (path === '/api/admin/cards' && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const q = queryObject(url);
      return jsonResponse(request, await loadCardsWithBusinesses({ ...(q.theme ? { theme: q.theme } : {}), ...(q.status ? { status: q.status } : {}) }));
    }
    if (/^\/api\/admin\/cards\/[^/]+$/.test(path) && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const cards = await loadCardsWithBusinesses({ id });
      if (cards.length === 0) return jsonResponse(request, { error: 'Card not found' }, { status: 404 });
      return jsonResponse(request, cards[0]);
    }
    if (path === '/api/admin/analytics' && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const q = queryObject(url);
      return jsonResponse(request, await getAdminAnalytics({ ...(q.from ? { from: q.from } : {}), ...(q.to ? { to: q.to } : {}), ...(q.city ? { city: q.city } : {}) }));
    }

    if (path === '/api/admin/me' && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const rows = await dbQuery<{ id: string; email: string; role: string; full_name: string | null; location: string | null }>(
        'SELECT id, email::text AS email, role, full_name, location FROM admins WHERE id = $1 LIMIT 1',
        [auth.sub],
      );
      const admin = rows[0];
      return jsonResponse(request, admin ? { id: admin.id, email: admin.email, role: admin.role, fullName: admin.full_name, location: admin.location } : { id: auth.sub, email: '', role: 'admin', fullName: null, location: null });
    }

    if (path === '/api/admin/me' && request.method === 'PATCH') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const body = adminSettingsSchema.parse(await readJsonBody(request, {}));
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;
      if (body.email !== undefined) { updates.push(`email = $${paramIndex++}`); values.push(body.email); }
      if (body.fullName !== undefined) { updates.push(`full_name = $${paramIndex++}`); values.push(body.fullName); }
      if (body.location !== undefined) { updates.push(`location = $${paramIndex++}`); values.push(body.location); }
      if (body.password !== undefined) { updates.push(`password_hash = $${paramIndex++}`); values.push(await bcrypt.hash(body.password, 10)); }
      if (updates.length === 0) return jsonResponse(request, { error: 'No fields to update' }, { status: 400 });
      values.push(auth.sub);
      const rows = await dbQuery(`UPDATE admins SET ${updates.join(', ')}, updated_at = now() WHERE id = $${paramIndex} RETURNING id, email::text AS email, role, full_name, location`, values);
      return jsonResponse(request, rows[0] ?? {});
    }

    if (path === '/api/admin/vendors' && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const q = queryObject(url);
      const rows = await dbQuery(
        `SELECT v.*, vp.discount_code, vp.pkpass_base64 IS NOT NULL AS has_pass
         FROM vendors v LEFT JOIN vendor_passes vp ON vp.id = v.vendor_pass_id
         WHERE ($1::text IS NULL OR v.status = $1) AND ($2::text IS NULL OR v.category = $2) ORDER BY v.created_at DESC`,
        [q.status ?? null, q.category ?? null],
      );
      return jsonResponse(request, rows);
    }
    if (path === '/api/admin/vendors' && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const body = vendorSchema.parse(await readJsonBody(request, {}));
      const pass = await getOrCreateVendorPass({
        name: body.name,
        location: body.location,
        discountType: body.discountType,
        discountAmount: body.discountAmount,
        iconPng: body.iconPng,
        logoPng: body.logoPng,
      });
      const rows = await dbQuery<{ id: string }>(
        `INSERT INTO vendors (name, location, category, pos_type, discount_type, discount_amount, status, vendor_pass_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [body.name, body.location, body.category, body.posType, body.discountType, body.discountAmount, body.status ?? 'approved', pass.vendorPassId],
      );
      await writeTransactionAudit({ actorType: 'admin', actorId: auth.sub, action: 'admin.vendor.create', entityType: 'vendor', entityId: rows[0]!.id, metadata: { name: body.name, discountCode: pass.discountCode }, ip: getIp(request) });
      return jsonResponse(request, { id: rows[0]!.id, ...pass }, { status: 201 });
    }
    if (/^\/api\/admin\/vendors\/[^/]+$/.test(path) && request.method === 'PATCH') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const body = vendorUpdateSchema.parse(await readJsonBody(request, {}));
      const rows = await dbQuery(
        `UPDATE vendors SET name = COALESCE($2, name), location = COALESCE($3, location), category = COALESCE($4, category), pos_type = COALESCE($5, pos_type), status = COALESCE($6, status), updated_at = now() WHERE id = $1 RETURNING *`,
        [id, body.name ?? null, body.location ?? null, body.category ?? null, body.posType ?? null, body.status ?? null],
      );
      return jsonResponse(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/vendors\/[^/]+$/.test(path) && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const rows = await dbQuery(
        `SELECT v.*, vp.discount_code, vp.pkpass_base64 IS NOT NULL AS has_pass FROM vendors v LEFT JOIN vendor_passes vp ON vp.id = v.vendor_pass_id WHERE v.id = $1 LIMIT 1`,
        [id],
      );
      if (rows.length === 0) return jsonResponse(request, { error: 'Vendor not found' }, { status: 404 });
      return jsonResponse(request, rows[0]);
    }
    if (/^\/api\/admin\/vendors\/[^/]+\/approve$/.test(path) && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').slice(-2)[0]!;
      const rows = await dbQuery("UPDATE vendors SET status = 'approved', updated_at = now() WHERE id = $1 RETURNING *", [id]);
      return jsonResponse(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/vendors\/[^/]+\/reject$/.test(path) && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').slice(-2)[0]!;
      const rows = await dbQuery("UPDATE vendors SET status = 'rejected', updated_at = now() WHERE id = $1 RETURNING *", [id]);
      return jsonResponse(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/vendors\/[^/]+\/activity$/.test(path) && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').slice(-2)[0]!;
      const rows = await dbQuery("SELECT * FROM transactions WHERE entity_type = 'vendor' AND entity_id = $1 ORDER BY created_at DESC", [id]);
      return jsonResponse(request, rows);
    }

    if (path === '/api/admin/cards' && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const body = cardSchema.parse(await readJsonBody(request, {}));
      const rows = await dbQuery<{ id: string }>(
        `INSERT INTO cards (name, theme, description, image_url, expiration_date, max_uses, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [body.name, body.theme, body.description ?? null, body.imageUrl ?? null, body.expirationDate ?? null, body.maxUses ?? null, body.status ?? 'draft'],
      );
      return jsonResponse(request, { id: rows[0]!.id }, { status: 201 });
    }
    if (/^\/api\/admin\/cards\/[^/]+$/.test(path) && request.method === 'PATCH') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const body = cardSchema.partial().parse(await readJsonBody(request, {}));
      const rows = await dbQuery(
        `UPDATE cards SET name = COALESCE($2, name), theme = COALESCE($3, theme), description = COALESCE($4, description), image_url = COALESCE($5, image_url), expiration_date = COALESCE($6, expiration_date), max_uses = COALESCE($7, max_uses), status = COALESCE($8, status), updated_at = now() WHERE id = $1 RETURNING *`,
        [id, body.name ?? null, body.theme ?? null, body.description ?? null, body.imageUrl ?? null, body.expirationDate ?? null, body.maxUses ?? null, body.status ?? null],
      );
      return jsonResponse(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/cards\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const rows = await dbQuery('DELETE FROM cards WHERE id = $1 RETURNING id', [id]);
      return jsonResponse(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/cards\/[^/]+\/vendors$/.test(path) && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/')[4]!;
      const body = z.object({ vendorId: z.string().uuid() }).parse(await readJsonBody(request, {}));
      const rows = await dbQuery('INSERT INTO card_vendors (card_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *', [id, body.vendorId]);
      return jsonResponse(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/cards\/[^/]+\/vendors\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const parts = path.split('/');
      const id = parts[4]!;
      const vendorId = parts[6]!;
      const rows = await dbQuery('DELETE FROM card_vendors WHERE card_id = $1 AND vendor_id = $2 RETURNING *', [id, vendorId]);
      return jsonResponse(request, rows[0] ?? {});
    }

    if (path === '/api/admin/discounts' && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const body = discountSchema.parse(await readJsonBody(request, {}));
      const rows = await dbQuery<{ id: string }>(
        `INSERT INTO discounts (card_id, vendor_id, type, value, min_purchase, max_uses_total, max_uses_per_customer, city_overrides, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) RETURNING id`,
        [body.cardId, body.vendorId, body.type, body.value, body.minPurchase, body.maxUsesTotal ?? null, body.maxUsesPerCustomer ?? null, JSON.stringify(body.cityOverrides), body.active],
      );
      return jsonResponse(request, { id: rows[0]!.id }, { status: 201 });
    }
    if (/^\/api\/admin\/discounts\/[^/]+$/.test(path) && request.method === 'PATCH') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const body = discountSchema.partial().parse(await readJsonBody(request, {}));
      const rows = await dbQuery(
        `UPDATE discounts SET card_id = COALESCE($2, card_id), vendor_id = COALESCE($3, vendor_id), type = COALESCE($4, type), value = COALESCE($5, value), min_purchase = COALESCE($6, min_purchase), max_uses_total = COALESCE($7, max_uses_total), max_uses_per_customer = COALESCE($8, max_uses_per_customer), city_overrides = COALESCE($9::jsonb, city_overrides), active = COALESCE($10, active), updated_at = now() WHERE id = $1 RETURNING *`,
        [id, body.cardId ?? null, body.vendorId ?? null, body.type ?? null, body.value ?? null, body.minPurchase ?? null, body.maxUsesTotal ?? null, body.maxUsesPerCustomer ?? null, body.cityOverrides ? JSON.stringify(body.cityOverrides) : null, body.active ?? null],
      );
      return jsonResponse(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/discounts\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const rows = await dbQuery('DELETE FROM discounts WHERE id = $1 RETURNING id', [id]);
      return jsonResponse(request, rows[0] ?? {});
    }

    if (path === '/api/passes' && request.method === 'POST') {
      const auth = requireRole(request, ['customer']);
      if (auth instanceof Response) return auth;
      const body = createPassSchema.parse(await readJsonBody(request, {}));
      const serialNumber = generateOpaqueToken(12);
      const lookupToken = generateOpaqueToken(18);
      const authToken = generateOpaqueToken(18);
      const rows = await dbQuery<{ id: string; serial_number: string }>(
        `INSERT INTO passes (user_id, card_id, platform, serial_number, auth_token, lookup_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, serial_number`,
        [auth.sub, body.cardId, body.platform, serialNumber, authToken, lookupToken],
      );
      const card = await dbQuery<{ name: string; description: string | null }>('SELECT name, description FROM cards WHERE id = $1 LIMIT 1', [body.cardId]);
      const passMetadata = {
        passId: rows[0]!.id,
        serialNumber,
        lookupToken,
        authToken,
        cardName: card[0]?.name ?? 'Master Card',
        description: card[0]?.description ?? null,
      };
      const wallet = body.platform === 'apple' ? buildApplePassPackage(passMetadata) : buildGoogleWalletLink({ passId: passMetadata.passId, serialNumber: passMetadata.serialNumber, lookupToken: passMetadata.lookupToken, cardName: passMetadata.cardName });
      return jsonResponse(request, { pass: passMetadata, wallet, downloadUrl: `/api/passes/${rows[0]!.serial_number}` }, { status: 201 });
    }

    if (/^\/api\/passes\/[^/]+$/.test(path) && request.method === 'GET') {
      const serial = path.split('/').pop()!;
      const rows = await dbQuery(
        `SELECT p.*, c.name AS card_name, c.description AS card_description FROM passes p JOIN cards c ON c.id = p.card_id WHERE p.serial_number = $1 LIMIT 1`,
        [serial],
      );
      if (rows.length === 0) return jsonResponse(request, { error: 'Pass not found' }, { status: 404 });
      return jsonResponse(request, rows[0]);
    }

    if (/^\/api\/lookup\/[^/]+$/.test(path) && request.method === 'GET' && path.split('/').length === 4) {
      const lookupToken = path.split('/').pop()!;
      const city = url.searchParams.get('city') ?? '';
      const vendorId = url.searchParams.get('vendorId') ?? '';
      const result = await resolvePassLookup(lookupToken, vendorId || undefined, city || undefined);
      if (!result) return jsonResponse(request, { error: 'Not found' }, { status: 404 });
      return jsonResponse(request, result);
    }

    if (/^\/api\/lookup\/card\/[^/]+$/.test(path) && request.method === 'GET') {
      const cardId = path.split('/').pop()!;
      const vendorId = url.searchParams.get('vendorId') ?? '';
      const city = url.searchParams.get('city') ?? '';
      const result = await resolveCardLookup(cardId, vendorId || undefined, city || undefined);
      if (!result) return jsonResponse(request, { error: 'Not found' }, { status: 404 });
      return jsonResponse(request, result);
    }

    if (path === '/api/redeem' && request.method === 'POST') {
      const body = z.object({
        lookupToken: z.string().optional(),
        cardId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        vendorId: z.string().uuid(),
        discountId: z.string().uuid().optional(),
        city: z.string().optional(),
        purchaseAmount: z.number().optional(),
        giftCardId: z.string().uuid().optional(),
      }).parse(await readJsonBody(request, {}));
      const auth = authenticate(request);
      const result = await redeemDiscount({
        vendorId: body.vendorId,
        ...(body.lookupToken ? { lookupToken: body.lookupToken } : {}),
        ...(body.cardId ? { cardId: body.cardId } : {}),
        ...(body.userId ? { userId: body.userId } : {}),
        ...(body.discountId ? { discountId: body.discountId } : {}),
        ...(body.city ? { city: body.city } : {}),
        ...(body.purchaseAmount !== undefined ? { purchaseAmount: body.purchaseAmount } : {}),
        ...(body.giftCardId ? { giftCardId: body.giftCardId } : {}),
        actorType: auth?.role ?? 'system',
        actorId: auth?.sub ?? null,
        ip: getIp(request),
      });
      return jsonResponse(request, result);
    }

    if (path === '/api/discounts/lookup' && request.method === 'GET') {
      const token = url.searchParams.get('token') ?? '';
      const city = url.searchParams.get('city') ?? '';
      if (!token) return jsonResponse(request, { error: 'token is required' }, { status: 400 });
      const result = await resolvePassLookup(token, undefined, city || undefined);
      if (!result) return jsonResponse(request, { error: 'Not found' }, { status: 404 });
      return jsonResponse(request, result);
    }

    return notFound(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse(request, { error: 'Validation error', issues: error.errors }, { status: 400 });
    }
    console.error(error);
    return jsonResponse(request, { error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}

async function loadCardsWithBusinesses(filters: { id?: string; theme?: string; status?: string; city?: string }) {
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
    `SELECT * FROM cards WHERE ($1::uuid IS NULL OR id = $1::uuid) AND ($2::text IS NULL OR $2 = '' OR theme = $2) AND ($3::text IS NULL OR $3 = '' OR status = $3) ORDER BY created_at DESC`,
    [filters.id ?? null, filters.theme ?? null, filters.status ?? null],
  );

  const cardIds = cards.map((card) => card.id);
  const vendors = cardIds.length
    ? await dbQuery<{
        card_id: string;
        vendor_id: string;
        vendor_name: string;
        vendor_city: string | null;
        discount_id: string | null;
        discount_type: 'fixed' | 'percent' | 'bogo' | null;
        discount_value: string | null;
        min_purchase: string | null;
        max_uses_total: number | null;
        max_uses_per_customer: number | null;
        uses_count: number | null;
        city_overrides: Record<string, { type?: 'fixed' | 'percent' | 'bogo'; value?: number }> | null;
        active: boolean | null;
      }>(
        `SELECT cv.card_id, v.id AS vendor_id, v.name AS vendor_name, v.city AS vendor_city, d.id AS discount_id, d.type AS discount_type, d.value AS discount_value, d.min_purchase, d.max_uses_total, d.max_uses_per_customer, d.uses_count, d.city_overrides, d.active FROM card_vendors cv JOIN vendors v ON v.id = cv.vendor_id LEFT JOIN discounts d ON d.card_id = cv.card_id AND d.vendor_id = cv.vendor_id WHERE cv.card_id = ANY($1::uuid[]) ORDER BY v.name`,
        [cardIds],
      )
    : [];

  return cards.map((card) => ({
    ...card,
    participatingBusinesses: vendors.filter((vendor) => vendor.card_id === card.id).map((vendor) => ({
      id: vendor.vendor_id,
      name: vendor.vendor_name,
      city: vendor.vendor_city,
      discount: vendor.discount_id && vendor.discount_type && vendor.discount_value !== null && vendor.min_purchase !== null
        ? buildLookupDiscountView(
            {
              id: vendor.discount_id,
              card_id: card.id,
              vendor_id: vendor.vendor_id,
              type: vendor.discount_type,
              value: vendor.discount_value,
              min_purchase: vendor.min_purchase,
              max_uses_total: vendor.max_uses_total,
              max_uses_per_customer: vendor.max_uses_per_customer,
              uses_count: vendor.uses_count ?? 0,
              city_overrides: vendor.city_overrides,
              active: Boolean(vendor.active),
            },
            filters.city ?? null,
          )
        : null,
    })),
  }));
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
