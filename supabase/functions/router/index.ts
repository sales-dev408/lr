import { z } from 'npm:zod';
import bcrypt from 'npm:bcryptjs';
import QRCode from 'npm:qrcode';
import { config } from './lib/config.ts';
import { authenticate, requireRole } from './lib/auth.ts';
import { dbQuery, withDbClient } from './lib/db.ts';
import { getAdminAnalytics } from './lib/analytics.ts';
import { buildLookupDiscountView } from './lib/discounts.ts';
import { generateOpaqueToken } from './lib/ids.ts';
import { resolvePassLookup, resolveCardLookup } from './lib/lookup.ts';
import { redeemDiscount } from './lib/redeem.ts';
import { buildApplePassPackage, buildGoogleWalletLink, buildAddpassPayload, buildPkpassDownloadUrl, buildWalletEmbedHtml } from './lib/wallet.ts';
import { addpassConfigured, streamPkPass } from './lib/addpass.ts';
import { createVendorWithDiscount } from './lib/vendors.ts';
import { humanDiscountLabel } from './lib/codes.ts';

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

const socialSchema = z
  .object({
    provider: z.string().min(1),
    token: z.string().min(1).optional(),
    idToken: z.string().min(1).optional(),
    email: z.string().email().optional(),
    fullName: z.string().min(1).default('Social User'),
  })
  .refine((value) => Boolean(value.token || value.idToken), { message: 'token or idToken is required' });

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

const adminVendorCreateSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  category: z.enum(['Sports', 'Dining', 'Entertainment']),
  posSystem: z.string().optional(),
  discountType: z.enum(['fixed', 'percent', 'bogo']).default('percent'),
  discountValue: z.number().positive(),
  iconDataUrl: z.string().optional(),
  logoDataUrl: z.string().optional(),
});

const adminVendorUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  category: z.enum(['Sports', 'Dining', 'Entertainment']).optional(),
  posSystem: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(),
});

const adminSettingsSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  location: z.string().optional(),
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

function notFound(request: Request): Response {
  return json(request, { error: 'Not found' }, { status: 404 });
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  // Normalize the request path to the internal /api/* contract regardless of how
  // the Edge Function is invoked. Supabase serves it under
  //   /functions/v1/router/...   (local / direct)
  //   /router/...                (production gateway strips /functions/v1)
  // and clients may or may not include the /api prefix. All of these resolve to
  // the same internal routes, which is what eliminates the 404/Not Found errors.
  let path = url.pathname
    .replace(/^\/functions\/v1\/router(?=\/|$)/, '')
    .replace(/^\/router(?=\/|$)/, '');
  if (path === '' || path === '/') {
    path = '/';
  } else {
    if (!path.startsWith('/')) path = `/${path}`;
    if (path !== '/api' && !path.startsWith('/api/')) {
      path = `/api${path}`;
    }
  }

  const baseUrl = config.publicApiBaseUrl || `${url.origin}/functions/v1/router`;

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

    if (path === '/api/auth/admin/login' && request.method === 'POST') {
      const body = adminLoginSchema.parse(await readJsonBody(request, {}));
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

    // Public, customer-facing vendor directory for the mobile app. The raw
    // discount code is intentionally NOT included — customers only ever see the
    // barcode inside the Apple Wallet pass they add via `walletUrl`.
    if ((path === '/api/vendors' || /^\/api\/vendors\/[^/]+$/.test(path)) && request.method === 'GET') {
      const single = path !== '/api/vendors';
      const vendorId = single ? path.split('/').pop()! : null;
      const rows = await dbQuery<{
        id: string;
        name: string;
        address: string | null;
        location: string | null;
        category: string | null;
        pos_system: string | null;
        icon_url: string | null;
        logo_url: string | null;
        card_id: string;
        discount_type: 'fixed' | 'percent' | 'bogo';
        discount_value: string;
        card_icon: string | null;
        card_logo: string | null;
      }>(
        `SELECT v.id, v.name, v.address, v.location, v.category, v.pos_system, v.icon_url, v.logo_url,
                c.id AS card_id, c.discount_type, c.discount_value, c.icon_url AS card_icon, c.logo_url AS card_logo
         FROM vendors v
         JOIN card_vendors cv ON cv.vendor_id = v.id
         JOIN cards c ON c.id = cv.card_id AND c.status = 'active' AND c.discount_code IS NOT NULL
         WHERE v.status = 'approved' AND ($1::uuid IS NULL OR v.id = $1::uuid)
         ORDER BY v.name`,
        [vendorId],
      );
      const items = rows.map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address ?? row.location,
        category: row.category,
        posSystem: row.pos_system,
        iconUrl: row.icon_url ?? row.card_icon,
        logoUrl: row.logo_url ?? row.card_logo,
        discount: {
          type: row.discount_type,
          value: Number(row.discount_value),
          label: humanDiscountLabel(row.discount_type, Number(row.discount_value)),
        },
        cardId: row.card_id,
        walletUrl: buildPkpassDownloadUrl(baseUrl, row.card_id),
      }));
      if (single) {
        if (items.length === 0) return json(request, { error: 'Vendor not found' }, { status: 404 });
        return json(request, items[0]);
      }
      return json(request, items);
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
    if (path === '/api/admin/settings' && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const rows = await dbQuery('SELECT id, email::text AS email, role, location FROM admins WHERE id = $1 LIMIT 1', [auth.sub]);
      if (!rows[0]) return json(request, { error: 'Not found' }, { status: 404 });
      return json(request, rows[0]);
    }
    if (path === '/api/admin/settings' && request.method === 'PATCH') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const body = adminSettingsSchema.parse(await readJsonBody(request, {}));
      const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : null;
      const rows = await dbQuery(
        `UPDATE admins SET email = COALESCE($2, email), password_hash = COALESCE($3, password_hash), location = COALESCE($4, location), updated_at = now() WHERE id = $1 RETURNING id, email::text AS email, role, location`,
        [auth.sub, body.email ?? null, passwordHash, body.location ?? null],
      );
      return json(request, rows[0] ?? {});
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
      const body = adminVendorCreateSchema.parse(await readJsonBody(request, {}));
      const result = await createVendorWithDiscount(
        {
          name: body.name,
          address: body.address ?? null,
          category: body.category,
          posSystem: body.posSystem ?? null,
          discountType: body.discountType,
          discountValue: body.discountValue,
          iconDataUrl: body.iconDataUrl ?? null,
          logoDataUrl: body.logoDataUrl ?? null,
        },
        baseUrl,
      );
      return json(request, result, { status: 201 });
    }
    if (/^\/api\/admin\/vendors\/[^/]+$/.test(path) && request.method === 'PATCH') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      const body = adminVendorUpdateSchema.parse(await readJsonBody(request, {}));
      const rows = await dbQuery(
        `UPDATE vendors SET name = COALESCE($2, name), location = COALESCE($3, location), address = COALESCE($3, address), category = COALESCE($4, category), pos_system = COALESCE($5, pos_system), status = COALESCE($6, status), updated_at = now() WHERE id = $1 RETURNING *`,
        [id, body.name ?? null, body.address ?? null, body.category ?? null, body.posSystem ?? null, body.status ?? null],
      );
      return json(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/vendors\/[^/]+\/pass$/.test(path) && request.method === 'GET') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').slice(-2)[0]!;
      const rows = await dbQuery<{ card_id: string; card_name: string; discount_type: string; discount_value: string; discount_code: string; pkpass_url: string | null; pos_system: string | null }>(
        `SELECT c.id AS card_id, c.name AS card_name, c.discount_type, c.discount_value, c.discount_code, c.pkpass_url, v.pos_system
         FROM card_vendors cv JOIN cards c ON c.id = cv.card_id JOIN vendors v ON v.id = cv.vendor_id
         WHERE cv.vendor_id = $1 AND c.discount_code IS NOT NULL ORDER BY c.created_at DESC LIMIT 1`,
        [id],
      );
      const row = rows[0];
      if (!row) return json(request, { error: 'No discount pass for this vendor' }, { status: 404 });
      const downloadUrl = buildPkpassDownloadUrl(baseUrl, row.card_id);
      return json(request, {
        discountCode: row.discount_code,
        card: { id: row.card_id, name: row.card_name, pkpassHostedUrl: row.pkpass_url },
        wallet: { downloadUrl, embedHtml: buildWalletEmbedHtml(downloadUrl, row.card_name) },
        posInstructions: `Scan the barcode or manually enter code ${row.discount_code} in your POS${row.pos_system ? ` (${row.pos_system})` : ''}. No NFC required.`,
      });
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
      return json(request, rows[0] ?? {});
    }
    if (/^\/api\/admin\/discounts\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const auth = requireRole(request, ['admin']);
      if (auth instanceof Response) return auth;
      const id = path.split('/').pop()!;
      return json(request, await dbQuery('DELETE FROM discounts WHERE id = $1 RETURNING id', [id]));
    }

    // Streams the .pkpass for a discount tier so the mobile app / website can
    // offer a stable "Add to Apple Wallet" link. The barcode inside always
    // encodes the tier's discount code (never shown to the customer directly).
    if (/^\/api\/passes\/card\/[^/]+\/pkpass$/.test(path) && request.method === 'GET') {
      const cardId = path.split('/').slice(-2)[0]!;
      const rows = await dbQuery<{ id: string; name: string; discount_type: 'fixed' | 'percent' | 'bogo'; discount_value: string; discount_code: string; icon_url: string | null; logo_url: string | null }>(
        `SELECT id, name, discount_type, discount_value, discount_code, icon_url, logo_url FROM cards WHERE id = $1 AND discount_code IS NOT NULL LIMIT 1`,
        [cardId],
      );
      const card = rows[0];
      if (!card) return json(request, { error: 'Pass not found' }, { status: 404 });
      if (!addpassConfigured()) return json(request, { error: 'Apple Wallet pass generation is not configured' }, { status: 503 });
      const bytes = await streamPkPass(
        buildAddpassPayload({ id: card.id, name: card.name, discountType: card.discount_type, discountValue: Number(card.discount_value), discountCode: card.discount_code, iconUrl: card.icon_url, logoUrl: card.logo_url }),
      );
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="${card.discount_code}.pkpass"`,
          'Access-Control-Allow-Origin': corsOrigin(request),
        },
      });
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
