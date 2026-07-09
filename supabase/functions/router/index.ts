import { z } from 'npm:zod';
import bcrypt from 'npm:bcryptjs';
import QRCode from 'npm:qrcode';
import { config } from './lib/config.ts';
import { authenticate, requireRole } from './lib/auth.ts';
import { verifyCaptcha } from './lib/captcha.ts';
import { dbQuery, withDbClient } from './lib/db.ts';
import { getAdminAnalytics, getVendorAnalytics } from './lib/analytics.ts';
import { buildLookupDiscountView } from './lib/discounts.ts';
import { generateOpaqueToken, generateTempPassword } from './lib/ids.ts';
import { resolvePassLookup, resolveCardLookup } from './lib/lookup.ts';
import { redeemDiscount } from './lib/redeem.ts';
import { buildApplePassPackage, buildGoogleWalletLink } from './lib/wallet.ts';
import {
  connectVendorPosProvider,
  deleteDiscountFromVendorConnections,
  disconnectVendorPosProvider,
  finalizePosConnection,
  getPosConnectionByProvider,
  getPosConnectionSummary,
  syncConnectionDiscountsByProvider,
  syncDiscountToVendorConnections,
} from './lib/pos.ts';
import { writeTransactionAudit } from './lib/audit.ts';

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

const socialSchema = z
  .object({
    provider: z.string().min(1),
    token: z.string().min(1).optional(),
    idToken: z.string().min(1).optional(),
    email: z.string().email().optional(),
    fullName: z.string().min(1).default('Social User'),
  })
  .refine((value) => Boolean(value.token || value.idToken), { message: 'token or idToken is required' });

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
  cityOverrides: z.record(z.string(), z.object({ type: z.enum(['fixed', 'percent', 'bogo']).optional(), value: z.number().optional() })).default({}),
  active: z.boolean().default(true),
});

const providerSchema = z.enum(['square', 'clover', 'toast', 'stripe']);

function corsOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (!origin) return '*';
  if (config.allowedOrigins.length === 0) return '*';
  return config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0]!;
}

function json(request: Request, body: unknown, init: ResponseInit = {}): Response {
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

function encodeBase64UrlJson(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    const jsonText = atob(value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
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
    `
      SELECT *
      FROM cards
      WHERE ($1::uuid IS NULL OR id = $1::uuid)
        AND ($2::text IS NULL OR $2 = '' OR theme = $2)
        AND ($3::text IS NULL OR $3 = '' OR status = $3)
      ORDER BY created_at DESC
    `,
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
        `
          SELECT cv.card_id,
                 v.id AS vendor_id,
                 v.name AS vendor_name,
                 v.city AS vendor_city,
                 d.id AS discount_id,
                 d.type AS discount_type,
                 d.value AS discount_value,
                 d.min_purchase,
                 d.max_uses_total,
                 d.max_uses_per_customer,
                 d.uses_count,
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

  return cards.map((card) => ({
    ...card,
    participatingBusinesses: vendors.filter((vendor) => vendor.card_id === card.id).map((vendor) => ({
      id: vendor.vendor_id,
      name: vendor.vendor_name,
      city: vendor.vendor_city,
      discount:
        vendor.discount_id && vendor.discount_type && vendor.discount_value !== null && vendor.min_purchase !== null
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

function portalRedirect(params: Record<string, string>): string {
  const url = new URL(config.vendorPortalUrl.replace(/\/$/, '') + '/pos-integration');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function notFound(request: Request): Response {
  return json(request, { error: 'Not found' }, { status: 404 });
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  // Default route = the actual request path
  let path = url.pathname;

  // Compatibility: support callers hitting:
  //   /functions/v1/router/auth/admin/login
  // by rewriting to your internal routes:
  //   /api/auth/admin/login
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
      return json(request, { error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    if (path === '/' && request.method === 'GET') {
      return json(request, { name: 'Master Gift/Discount Card System Backend', version: '0.1.0' });
    }

    if (path === '/api/health' && request.method === 'GET') {
      let db = false;
      try {
        await dbQuery('SELECT 1');
        db = true;
      } catch {
        db = false;
      }
      return json(request, { status: 'ok', db });
    }

    if (path === '/api/auth/register' && request.method === 'POST') {
      const body = customerRegisterSchema.parse(await readJsonBody(request, {}));
      if (!(await verifyCaptcha(body.captchaToken))) return json(request, { error: 'CAPTCHA failed' }, { status: 400 });
      if (!body.email && !body.phone && !body.socialProvider) return json(request, { error: 'Email, phone, or social login is required' }, { status: 400 });
      const passwordHash = await bcrypt.hash(body.password, 10);
      const rows = await withDbClient(async (client) => {
        await client.query('BEGIN');
        try {
          const result = await client.query<{ id: string }>(
            `INSERT INTO users (email, phone, password_hash, social_provider, social_id, full_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
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
      const token = await issueToken('customer', rows[0]!.id, profile?.email ?? body.email ?? null);
      return json(request, { token, expiresIn: '7d', profile }, { status: 201 });
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
      const body = customerLoginSchema.parse(await readJsonBody(request, {}));
      if (!(await verifyCaptcha(body.captchaToken))) return json(request, { error: 'CAPTCHA failed' }, { status: 400 });
      const rows = await dbQuery<{ id: string; email: string | null; password_hash: string | null }>(
        'SELECT id, email::text AS email, password_hash FROM users WHERE (email::text = $1 OR phone = $2) LIMIT 1',
        [body.email ?? null, body.phone ?? null],
      );
      const user = rows[0];
      if (!user || !user.password_hash || !(await bcrypt.compare(body.password, user.password_hash))) {
        return json(request, { error: 'Invalid credentials' }, { status: 401 });
      }
      const profile = await buildCustomerProfile(user.id);
      const token = await issueToken('customer', user.id, user.email);
      return json(request, { token, expiresIn: '7d', profile });
    }

    if (path === '/api/auth/social' && request.method === 'POST') {
      const body = socialSchema.parse(await readJsonBody(request, {}));
      const socialToken = body.token ?? body.idToken ?? '';
      const socialId = `${body.provider}:${socialToken}`;
      const rows = await withDbClient(async (client) => {
        await client.query('BEGIN');
        try {
          const existing = await client.query<{ id: string; email: string | null }>('SELECT id, email::text AS email FROM users WHERE social_provider = $1 AND social_id = $2 LIMIT 1', [
            body.provider,
            socialId,
          ]);
          if (existing.rows[0]) {
            await client.query('COMMIT');
            return existing.rows[0]!;
          }
          const created = await client.query<{ id: string }>(
            `INSERT INTO users (email, password_hash, social_provider, social_id, full_name) VALUES ($1, NULL, $2, $3, $4) RETURNING id`,
            [body.email ?? null, body.provider, socialId, body.fullName],
          );
          await client.query('COMMIT');
          return { id: created.rows[0]!.id, email: body.email ?? null };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
      const token = await issueToken('customer', rows.id, rows.email);
      const profile = await buildCustomerProfile(rows.id);
      return json(request, { token, expiresIn: '7d', profile });
    }

    if (path === '/api/auth/vendor/login' && request.method === 'POST') {
      const body = vendorLoginSchema.parse(await readJsonBody(request, {}));
      if (!(await verifyCaptcha(body.captchaToken))) return json(request, { error: 'CAPTCHA failed' }, { status: 400 });
      const rows = await dbQuery<{ id: string; email: string; password_hash: string; status: string; name: string; location: string | null; city: string | null; category: string | null; pos_type: string }>(
        'SELECT * FROM vendors WHERE email::text = $1 LIMIT 1',
        [body.email],
      );
      const vendor = rows[0];
      if (!vendor || !(await bcrypt.compare(body.password, vendor.password_hash))) return json(request, { error: 'Invalid credentials' }, { status: 401 });
      const token = await issueToken('vendor', vendor.id, vendor.email);
      return json(request, {
        token,
        expiresIn: '7d',
        profile: {
          id: vendor.id,
          email: vendor.email,
          name: vendor.name,
          location: vendor.location,
          city: vendor.city,
          category: vendor.category,
          posType: vendor.pos_type,
          status: vendor.status,
        },
      });
    }

    if (path === '/api/auth/admin/login' && request.method === 'POST') {
      const body = adminLoginSchema.parse(await readJsonBody(request, {}));
      if (!(await verifyCaptcha(body.captchaToken))) return json(request, { error: 'CAPTCHA failed' }, { status: 400 });
      const rows = await dbQuery<{ id: string; email: string; password_hash: string; role: string }>('SELECT id, email::text AS email, password_hash, role FROM admins WHERE email::text = $1 LIMIT 1', [
        body.email,
      ]);
      const admin = rows[0];
      if (!admin || !(await bcrypt.compare(body.password, admin.password_hash))) return json(request, { error: 'Invalid credentials' }, { status: 401 });
      const token = await issueToken('admin', admin.id, admin.email);
      return json(request, { token, expiresIn: '7d', profile: { id: admin.id, email: admin.email, role: admin.role } });
    }

    if (path === '/api/cards' && request.method === 'GET') {
      return json(request, await loadCardsWithBusinesses({ theme: url.searchParams.get('theme') ?? '', status: 'active', city: url.searchParams.get('city') ?? '' }));
    }

    if (/^\/api\/cards\/[^/]+$/.test(path) && request.method === 'GET') {
      const id = path.split('/').pop()!;
      const cards = await dbQuery('SELECT * FROM cards WHERE id = $1 LIMIT 1', [id]);
      if (cards.length === 0) return json(request, { error: 'Card not found' }, { status: 404 });
      const vendors = await dbQuery(`SELECT v.id, v.name, v.city, d.* FROM card_vendors cv JOIN vendors v ON v.id = cv.vendor_id LEFT JOIN discounts d ON d.card_id = cv.card_id AND d.vendor_id = cv.vendor_id WHERE cv.card_id = $1`, [id]);
      return json(request, { ...(cards[0] as Record<string, unknown>), participatingBusinesses: vendors });
    }

    if (path === '/api/admin/cards' && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const q = queryObject(url);
      return json(request, await loadCardsWithBusinesses({ ...(q.theme ? { theme: q.theme } : {}), ...(q.status ? { status: q.status } : {}) }));
    }
    if (/^\/api\/admin\/cards\/[^/]+$/.test(path) && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const cards = await loadCardsWithBusinesses({ id });
      if (cards.length === 0) return json(request, { error: 'Card not found' }, { status: 404 });
      return json(request, cards[0]);
    }
    if (path === '/api/admin/analytics' && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const q = queryObject(url);
      return json(request, await getAdminAnalytics({ ...(q.from ? { from: q.from } : {}), ...(q.to ? { to: q.to } : {}), ...(q.city ? { city: q.city } : {}) }));
    }
    if (path === '/api/admin/vendors' && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const q = queryObject(url);
      return json(request, await dbQuery(`SELECT * FROM vendors WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR city = $2) AND ($3::text IS NULL OR category = $3) ORDER BY created_at DESC`, [
        q.status ?? null,
        q.city ?? null,
        q.category ?? null,
      ]));
    }
    if (path === '/api/admin/vendors' && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const body = vendorSchema.parse(await readJsonBody(request, {}));
      const password = body.password ?? generateTempPassword();
      const hash = await bcrypt.hash(password, 10);
      const rows = await dbQuery<{ id: string }>(`INSERT INTO vendors (name, location, city, category, pos_type, email, password_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [
        body.name,
        body.location ?? null,
        body.city ?? null,
        body.category ?? null,
        body.posType,
        body.email,
        hash,
        body.status ?? 'pending',
      ]);
      await writeTransactionAudit({ actorType: 'admin', actorId: auth.sub, action: 'admin.vendor.create', entityType: 'vendor', entityId: rows[0]!.id, metadata: { name: body.name, email: body.email }, ip: getIp(request) });
      return json(request, { id: rows[0]!.id, tempPassword: password }, { status: 201 });
    }
    if (/^\/api\/admin\/vendors\/[^/]+$/.test(path) && request.method === 'PATCH') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const body = vendorSchema.partial().parse(await readJsonBody(request, {}));
      const rows = await dbQuery(
        `UPDATE vendors SET name = COALESCE($2, name), location = COALESCE($3, location), city = COALESCE($4, city), category = COALESCE($5, category), pos_type = COALESCE($6, pos_type), email = COALESCE($7, email), status = COALESCE($8, status), updated_at = now() WHERE id = $1 RETURNING *`,
        [id, body.name ?? null, body.location ?? null, body.city ?? null, body.category ?? null, body.posType ?? null, body.email ?? null, body.status ?? null],
      );
      return json(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/vendors\/[^/]+\/approve$/.test(path) && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').slice(-2)[0]!;
      return json(request, await dbQuery('UPDATE vendors SET status = \'approved\', updated_at = now() WHERE id = $1 RETURNING *', [id]));
    }
    if (/^\/api\/admin\/vendors\/[^/]+\/reject$/.test(path) && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').slice(-2)[0]!;
      return json(request, await dbQuery('UPDATE vendors SET status = \'rejected\', updated_at = now() WHERE id = $1 RETURNING *', [id]));
    }
    if (/^\/api\/admin\/vendors\/[^/]+\/reset-password$/.test(path) && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').slice(-2)[0]!;
      const tempPassword = generateTempPassword();
      const hash = await bcrypt.hash(tempPassword, 10);
      await dbQuery('UPDATE vendors SET password_hash = $2, updated_at = now() WHERE id = $1', [id, hash]);
      return json(request, { tempPassword });
    }
    if (/^\/api\/admin\/vendors\/[^/]+\/activity$/.test(path) && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').slice(-2)[0]!;
      return json(request, await dbQuery('SELECT * FROM transactions WHERE entity_type = \'vendor\' AND entity_id = $1 ORDER BY created_at DESC', [id]));
    }
    if (path === '/api/admin/cards' && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const body = cardSchema.parse(await readJsonBody(request, {}));
      const rows = await dbQuery<{ id: string }>(`INSERT INTO cards (name, theme, description, image_url, expiration_date, max_uses, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [
        body.name,
        body.theme,
        body.description ?? null,
        body.imageUrl ?? null,
        body.expirationDate ?? null,
        body.maxUses ?? null,
        body.status ?? 'draft',
      ]);
      return json(request, { id: rows[0]!.id }, { status: 201 });
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
      return json(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/cards\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      return json(request, await dbQuery('DELETE FROM cards WHERE id = $1 RETURNING id', [id]));
    }
    if (/^\/api\/admin\/cards\/[^/]+\/vendors$/.test(path) && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').slice(-2)[0]!;
      const body = z.object({ vendorId: z.string().uuid() }).parse(await readJsonBody(request, {}));
      return json(request, await dbQuery('INSERT INTO card_vendors (card_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *', [id, body.vendorId]));
    }
    if (/^\/api\/admin\/cards\/[^/]+\/vendors\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const parts = path.split('/');
      return json(request, await dbQuery('DELETE FROM card_vendors WHERE card_id = $1 AND vendor_id = $2 RETURNING *', [parts[4], parts[6]]));
    }
    if (path === '/api/admin/discounts' && request.method === 'POST') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const body = discountSchema.parse(await readJsonBody(request, {}));
      const rows = await dbQuery<{ id: string }>(
        `INSERT INTO discounts (card_id, vendor_id, type, value, min_purchase, max_uses_total, max_uses_per_customer, city_overrides, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) RETURNING id`,
        [body.cardId, body.vendorId, body.type, body.value, body.minPurchase, body.maxUsesTotal ?? null, body.maxUsesPerCustomer ?? null, JSON.stringify(body.cityOverrides), body.active],
      );
      void syncDiscountToVendorConnections({ discountId: rows[0]!.id, action: 'upsert' }).catch(() => {});
      return json(request, { id: rows[0]!.id }, { status: 201 });
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
      void syncDiscountToVendorConnections({ discountId: id, action: 'upsert' }).catch(() => {});
      return json(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/discounts\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      void deleteDiscountFromVendorConnections({ discountId: id }).catch(() => {});
      return json(request, await dbQuery('DELETE FROM discounts WHERE id = $1 RETURNING id', [id]));
    }

    if (path === '/api/vendor/register' && request.method === 'POST') {
      const body = z.object({ name: z.string().min(1), location: z.string().optional(), city: z.string().optional(), category: z.string().optional(), posType: z.enum(['square', 'stripe', 'clover', 'toast', 'other']), email: z.string().email(), password: z.string().min(8) }).parse(await readJsonBody(request, {}));
      const hash = await bcrypt.hash(body.password, 10);
      const rows = await dbQuery<{ id: string }>(`INSERT INTO vendors (name, location, city, category, pos_type, email, password_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`, [
        body.name,
        body.location ?? null,
        body.city ?? null,
        body.category ?? null,
        body.posType,
        body.email,
        hash,
      ]);
      return json(request, { id: rows[0]!.id, status: 'pending' }, { status: 201 });
    }
    if (path === '/api/vendor/cards' && request.method === 'GET') {
      const auth = requireRole(request, ['vendor']);
      if (auth instanceof Response) return auth;
      const vendorId = auth.sub;
      const rows = await dbQuery<{
        id: string;
        name: string;
        theme: string;
        description: string | null;
        image_url: string | null;
        expiration_date: string | null;
        max_uses: number | null;
        status: string;
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
        `SELECT c.id, c.name, c.theme, c.description, c.image_url, c.expiration_date, c.max_uses, c.status, d.id AS discount_id, d.type AS discount_type, d.value AS discount_value, d.min_purchase, d.max_uses_total, d.max_uses_per_customer, d.uses_count, d.city_overrides, d.active FROM card_vendors cv JOIN cards c ON c.id = cv.card_id LEFT JOIN discounts d ON d.card_id = cv.card_id AND d.vendor_id = cv.vendor_id WHERE cv.vendor_id = $1 ORDER BY c.created_at DESC`,
        [vendorId],
      );
      return json(
        request,
        rows.map((card) => ({
          id: card.id,
          name: card.name,
          theme: card.theme,
          description: card.description,
          image_url: card.image_url,
          expiration_date: card.expiration_date,
          max_uses: card.max_uses,
          status: card.status,
          discount:
            card.discount_id && card.discount_type && card.discount_value !== null && card.min_purchase !== null
              ? buildLookupDiscountView(
                  {
                    id: card.discount_id,
                    card_id: card.id,
                    vendor_id: vendorId,
                    type: card.discount_type,
                    value: card.discount_value,
                    min_purchase: card.min_purchase,
                    max_uses_total: card.max_uses_total,
                    max_uses_per_customer: card.max_uses_per_customer,
                    uses_count: card.uses_count ?? 0,
                    city_overrides: card.city_overrides,
                    active: Boolean(card.active),
                  },
                  null,
                )
              : null,
        })),
      );
    }
    if (path === '/api/vendor/analytics' && request.method === 'GET') {
      const auth = requireRole(request, ['vendor']);
      if (auth instanceof Response) return auth;
      return json(request, await getVendorAnalytics(auth.sub));
    }
    if (/^\/api\/vendor\/discounts\/[^/]+$/.test(path) && request.method === 'PATCH') {
      const auth = requireRole(request, ['vendor']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const body = z
        .object({
          type: z.enum(['fixed', 'percent', 'bogo']).optional(),
          value: z.number().optional(),
          minPurchase: z.number().optional(),
          maxUsesPerCustomer: z.number().int().positive().optional(),
          active: z.boolean().optional(),
          cityOverrides: z.record(z.string(), z.object({ type: z.enum(['fixed', 'percent', 'bogo']).optional(), value: z.number().optional() })).optional(),
        })
        .parse(await readJsonBody(request, {}));
      const ownership = await dbQuery<{ vendor_id: string }>('SELECT vendor_id FROM discounts WHERE id = $1 LIMIT 1', [id]);
      if (!ownership[0] || ownership[0].vendor_id !== auth.sub) return json(request, { error: 'Forbidden' }, { status: 403 });
      const rows = await dbQuery(
        `UPDATE discounts SET type = COALESCE($2, type), value = COALESCE($3, value), min_purchase = COALESCE($4, min_purchase), max_uses_per_customer = COALESCE($5, max_uses_per_customer), active = COALESCE($6, active), city_overrides = COALESCE($7::jsonb, city_overrides), updated_at = now() WHERE id = $1 RETURNING *`,
        [id, body.type ?? null, body.value ?? null, body.minPurchase ?? null, body.maxUsesPerCustomer ?? null, body.active ?? null, body.cityOverrides ? JSON.stringify(body.cityOverrides) : null],
      );
      void syncDiscountToVendorConnections({ discountId: id, action: 'upsert' }).catch(() => {});
      return json(request, rows[0] ?? {});
    }

    if (path === '/api/vendor/pos/connections' && request.method === 'GET') {
      const auth = requireRole(request, ['vendor']);
      if (auth instanceof Response) return auth;
      return json(request, await getPosConnectionSummary(auth.sub));
    }
    if (/^\/api\/vendor\/pos\/connections\/[^/]+\/connect$/.test(path) && request.method === 'POST') {
      const auth = requireRole(request, ['vendor']);
      if (auth instanceof Response) return auth;
      const provider = providerSchema.parse(path.split('/').slice(-2)[0]);
      const result = await connectVendorPosProvider({ vendorId: auth.sub, provider });
      await writeTransactionAudit({ actorType: 'vendor', actorId: auth.sub, action: `pos.${provider}.connect`, entityType: 'pos_connection', entityId: result.connection.id, metadata: { provider, mode: result.mode, status: result.connection.status }, ip: getIp(request) });
      return json(request, { provider, mode: result.mode, status: result.connection.status, ...(result.authorizeUrl ? { authorizeUrl: result.authorizeUrl, state: result.state } : {}), connection: result.connection, message: result.message });
    }
    if (/^\/api\/vendor\/pos\/connections\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const auth = requireRole(request, ['vendor']);
      if (auth instanceof Response) return auth;
      const provider = providerSchema.parse(path.split('/').pop());
      const connection = await disconnectVendorPosProvider({ vendorId: auth.sub, provider });
      if (!connection) return json(request, { error: 'POS connection not found' }, { status: 404 });
      await writeTransactionAudit({ actorType: 'vendor', actorId: auth.sub, action: `pos.${provider}.disconnect`, entityType: 'pos_connection', entityId: connection.id, metadata: { provider, status: connection.status }, ip: getIp(request) });
      return json(request, connection);
    }
    if (/^\/api\/vendor\/pos\/connections\/[^/]+\/sync$/.test(path) && request.method === 'POST') {
      const auth = requireRole(request, ['vendor']);
      if (auth instanceof Response) return auth;
      const provider = providerSchema.parse(path.split('/').slice(-2)[0]);
      const connection = await getPosConnectionByProvider(auth.sub, provider);
      if (!connection || connection.status !== 'connected') return json(request, { error: 'POS connection not found or not connected' }, { status: 404 });
      const results = await syncConnectionDiscountsByProvider({ vendorId: auth.sub, provider });
      await writeTransactionAudit({ actorType: 'vendor', actorId: auth.sub, action: `pos.${provider}.sync`, entityType: 'pos_connection', entityId: connection.id, metadata: { provider, synced: results.length }, ip: getIp(request) });
      return json(request, { provider, synced: results.length, results, status: connection.status });
    }
    if (path === '/api/pos/oauth/callback' && request.method === 'GET') {
      const q = queryObject(url);
      if (q.error) return Response.redirect(portalRedirect({ pos: 'error', message: q.error_description ?? q.error }), 302);
      if (!q.code) return Response.redirect(portalRedirect({ pos: 'error', message: 'Missing authorization code' }), 302);
      try {
        const result = await finalizePosConnection({ stateToken: q.state ?? '', code: q.code });
        await writeTransactionAudit({ actorType: 'vendor', actorId: result.vendorId, action: `pos.${result.provider}.callback`, entityType: 'pos_connection', entityId: result.connection.id, metadata: { provider: result.provider, mode: result.mode, status: result.connection.status }, ip: getIp(request) });
        return Response.redirect(portalRedirect({ pos: 'connected', provider: result.provider, mode: result.mode }), 302);
      } catch (error) {
        return Response.redirect(portalRedirect({ pos: 'error', message: error instanceof Error ? error.message : 'POS callback failed' }), 302);
      }
    }

    if (path === '/api/passes' && request.method === 'POST') {
      const auth = requireRole(request, ['customer']);
      if (auth instanceof Response) return auth;
      const body = z.object({ cardId: z.string().uuid(), platform: z.enum(['apple', 'google']) }).parse(await readJsonBody(request, {}));
      const serialNumber = generateOpaqueToken(12);
      const lookupToken = generateOpaqueToken(18);
      const authToken = generateOpaqueToken(18);
      const rows = await dbQuery<{ id: string; serial_number: string }>(
        `INSERT INTO passes (user_id, card_id, platform, serial_number, auth_token, lookup_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, serial_number`,
        [auth.sub, body.cardId, body.platform, serialNumber, authToken, lookupToken],
      );
      const card = await dbQuery<{ name: string; description: string | null }>('SELECT name, description FROM cards WHERE id = $1 LIMIT 1', [body.cardId]);
      const passMetadata = { passId: rows[0]!.id, serialNumber, lookupToken, authToken, cardName: card[0]?.name ?? 'Master Card', description: card[0]?.description ?? null };
      const wallet = body.platform === 'apple' ? buildApplePassPackage(passMetadata) : buildGoogleWalletLink({ passId: passMetadata.passId, serialNumber: passMetadata.serialNumber, lookupToken: passMetadata.lookupToken, cardName: passMetadata.cardName });
      return json(request, { pass: passMetadata, wallet, downloadUrl: `/api/passes/${rows[0]!.serial_number}` }, { status: 201 });
    }
    if (/^\/api\/passes\/[^/]+$/.test(path) && request.method === 'GET') {
      const serial = path.split('/').pop()!;
      const rows = await dbQuery(`SELECT p.*, c.name AS card_name, c.description AS card_description FROM passes p JOIN cards c ON c.id = p.card_id WHERE p.serial_number = $1 LIMIT 1`, [serial]);
      if (rows.length === 0) return json(request, { error: 'Pass not found' }, { status: 404 });
      return json(request, rows[0]);
    }
    if (/^\/api\/passes\/[^/]+\/registrations\/[^/]+$/.test(path) && request.method === 'POST') {
      const parts = path.split('/');
      const serial = parts[3]!;
      const deviceLibraryId = parts[5]!;
      const body = z.object({ pushToken: z.string().optional() }).parse(await readJsonBody(request, {}));
      await dbQuery('UPDATE passes SET device_library_id = $2, push_token = COALESCE($3, push_token), updated_at = now() WHERE serial_number = $1', [serial, deviceLibraryId, body.pushToken ?? null]);
      return json(request, { registered: true });
    }
    if (/^\/api\/passes\/[^/]+\/registrations\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const parts = path.split('/');
      const serial = parts[3]!;
      const deviceLibraryId = parts[5]!;
      await dbQuery('UPDATE passes SET device_library_id = NULL, push_token = NULL, updated_at = now() WHERE serial_number = $1 AND device_library_id = $2', [serial, deviceLibraryId]);
      return json(request, { deleted: true });
    }

    if (/^\/api\/lookup\/[^/]+$/.test(path) && request.method === 'GET') {
      const lookupToken = path.split('/').pop()!;
      const result = await resolvePassLookup(lookupToken, url.searchParams.get('vendorId') ?? undefined, url.searchParams.get('city') ?? undefined);
      if (!result) return json(request, { error: 'Not found' }, { status: 404 });
      return json(request, result);
    }
    if (path === '/api/discounts/lookup' && request.method === 'GET') {
      const token = url.searchParams.get('token') ?? '';
      if (!token) return json(request, { error: 'token is required' }, { status: 400 });
      const result = await resolvePassLookup(token, undefined, url.searchParams.get('city') ?? undefined);
      if (!result) return json(request, { error: 'Not found' }, { status: 404 });
      return json(request, result);
    }
    if (/^\/api\/lookup\/card\/[^/]+$/.test(path) && request.method === 'GET') {
      const cardId = path.split('/').pop()!;
      const result = await resolveCardLookup(cardId, url.searchParams.get('vendorId') ?? undefined, url.searchParams.get('city') ?? undefined);
      if (!result) return json(request, { error: 'Not found' }, { status: 404 });
      return json(request, result);
    }
    if (path === '/api/redeem' && request.method === 'POST') {
      const auth = authenticate(request);
      const body = z
        .object({
          lookupToken: z.string().optional(),
          cardId: z.string().uuid().optional(),
          userId: z.string().uuid().optional(),
          vendorId: z.string().uuid(),
          discountId: z.string().uuid().optional(),
          city: z.string().optional(),
          purchaseAmount: z.number().optional(),
          giftCardId: z.string().uuid().optional(),
        })
        .parse(await readJsonBody(request, {}));
      const result = await redeemDiscount({ ...body, actorType: auth?.role ?? 'system', actorId: auth?.sub ?? null, ip: getIp(request) });
      return json(request, result);
    }

    if (/^\/api\/onboarding\/[^/]+$/.test(path) && request.method === 'GET') {
      const code = path.split('/').pop()!;
      const decoded = decodeBase64UrlJson<{ vendorId?: string; cardId?: string }>(code);
      if (!decoded?.vendorId || !decoded?.cardId) return json(request, { error: 'Invalid onboarding code' }, { status: 404 });
      const rows = await dbQuery(`SELECT c.id AS card_id, c.theme, c.name AS card_name, v.id AS vendor_id, v.name AS vendor_name FROM cards c JOIN vendors v ON v.id = $1 WHERE c.id = $2 LIMIT 1`, [
        decoded.vendorId,
        decoded.cardId,
      ]);
      if (rows.length === 0) return json(request, { error: 'Not found' }, { status: 404 });
      return json(request, { theme: rows[0]!.theme, card: rows[0]!.card_name, vendor: rows[0]!.vendor_name, appStoreUrl: config.appStoreUrl, playStoreUrl: config.playStoreUrl });
    }
    if (path === '/api/qr/onboarding.png' && request.method === 'GET') {
      const vendorId = url.searchParams.get('vendorId') ?? '';
      const cardId = url.searchParams.get('cardId') ?? '';
      if (!vendorId || !cardId) return json(request, { error: 'vendorId and cardId are required' }, { status: 400 });
      const code = encodeBase64UrlJson({ vendorId, cardId });
      const deepLink = `lrcard://onboard?code=${encodeURIComponent(code)}`;
      const image = await QRCode.toBuffer(`${deepLink}\nhttps://example.invalid/onboard?code=${encodeURIComponent(code)}`, { type: 'png' });
      return new Response(image, { headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': corsOrigin(request) } });
    }
    if (/^\/api\/qr\/lookup\/[^/]+\.png$/.test(path) && request.method === 'GET') {
      const lookupToken = path.split('/').pop()!.replace(/\.png$/, '');
      const image = await QRCode.toBuffer(lookupToken, { type: 'png' });
      return new Response(image, { headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': corsOrigin(request) } });
    }

    return notFound(request);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
});
