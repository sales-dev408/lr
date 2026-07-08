import { z } from 'npm:zod';
import bcrypt from 'npm:bcryptjs';
import QRCode from 'npm:qrcode';
import jwt from 'npm:jsonwebtoken';
import postgres from 'npm:postgres';
import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';


export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function edgeHttpJson(body: JsonValue, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function edgeHttpErrorResponse(message: string, status = 400): Response {
  return edgeHttpJson({ error: message }, { status });
}

export async function readJson<T>(request: Request, fallback: T): Promise<T> {
  const text = await request.text();
  if (!text) {
    return fallback;
  }
  return JSON.parse(text) as T;
}

export function edgeHttpGetQueryParam(url: URL, key: string): string {
  return url.searchParams.get(key) ?? '';
}

export function edgeHttpCorsHeaders(origin?: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  };
}


const envSchema = z.object({
  SUPABASE_DB_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  PGSSLMODE: z.enum(['disable', 'prefer', 'require']).default('disable'),
  JWT_SECRET: z.string().min(8).default('dev-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ADMIN_EMAIL: z.string().email().default('owner@example.com'),
  ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
  CAPTCHA_PROVIDER: z.string().trim().default(''),
  CAPTCHA_SECRET: z.string().trim().default(''),
  APPLE_PASS_TYPE_ID: z.string().trim().default(''),
  APPLE_TEAM_ID: z.string().trim().default(''),
  APPLE_CERT_PATH: z.string().trim().default(''),
  APPLE_CERT_PASSWORD: z.string().trim().default(''),
  APPLE_WWDR_CERT_PATH: z.string().trim().default(''),
  APNS_KEY_PATH: z.string().trim().default(''),
  APNS_KEY_ID: z.string().trim().default(''),
  GOOGLE_WALLET_ISSUER_ID: z.string().trim().default(''),
  GOOGLE_WALLET_SERVICE_ACCOUNT_JSON: z.string().trim().default(''),
  POS_TOKEN_ENC_KEY: z.string().trim().default(''),
  POS_STATE_SECRET: z.string().trim().default('dev-pos-state-secret'),
  VENDOR_PORTAL_URL: z.string().url().default('http://localhost:5174'),
  SQUARE_APP_ID: z.string().trim().default(''),
  SQUARE_APP_SECRET: z.string().trim().default(''),
  SQUARE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  SQUARE_REDIRECT_URL: z.string().url().default('http://localhost:54321/functions/v1/router/api/pos/oauth/callback'),
  CLOVER_CLIENT_ID: z.string().trim().default(''),
  CLOVER_CLIENT_SECRET: z.string().trim().default(''),
  CLOVER_REDIRECT_URL: z.string().url().default('http://localhost:54321/functions/v1/router/api/pos/oauth/callback'),
  TOAST_CLIENT_ID: z.string().trim().default(''),
  TOAST_CLIENT_SECRET: z.string().trim().default(''),
  TOAST_REDIRECT_URL: z.string().url().default('http://localhost:54321/functions/v1/router/api/pos/oauth/callback'),
  STRIPE_CLIENT_ID: z.string().trim().default(''),
  STRIPE_CLIENT_SECRET: z.string().trim().default(''),
  STRIPE_REDIRECT_URL: z.string().url().default('http://localhost:54321/functions/v1/router/api/pos/oauth/callback'),
  APP_STORE_URL: z.string().url().default('https://apps.apple.com/'),
  PLAY_STORE_URL: z.string().url().default('https://play.google.com/store'),
  ALLOWED_ORIGINS: z.string().trim().default(''),
  BLOCKED_IPS: z.string().trim().default(''),
});

const parsed = envSchema.parse(Deno.env.toObject());

export const config = {
  databaseUrl: parsed.SUPABASE_DB_URL ?? parsed.DATABASE_URL ?? '',
  pgSslMode: parsed.PGSSLMODE,
  jwtSecret: parsed.JWT_SECRET,
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  adminEmail: parsed.ADMIN_EMAIL,
  adminPassword: parsed.ADMIN_PASSWORD,
  captchaProvider: parsed.CAPTCHA_PROVIDER,
  captchaSecret: parsed.CAPTCHA_SECRET,
  applePassTypeId: parsed.APPLE_PASS_TYPE_ID,
  appleTeamId: parsed.APPLE_TEAM_ID,
  appleCertPath: parsed.APPLE_CERT_PATH,
  appleCertPassword: parsed.APPLE_CERT_PASSWORD,
  appleWwdrCertPath: parsed.APPLE_WWDR_CERT_PATH,
  apnsKeyPath: parsed.APNS_KEY_PATH,
  apnsKeyId: parsed.APNS_KEY_ID,
  googleWalletIssuerId: parsed.GOOGLE_WALLET_ISSUER_ID,
  googleWalletServiceAccountJson: parsed.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON,
  posTokenEncKey: parsed.POS_TOKEN_ENC_KEY,
  posStateSecret: parsed.POS_STATE_SECRET,
  vendorPortalUrl: parsed.VENDOR_PORTAL_URL,
  squareAppId: parsed.SQUARE_APP_ID,
  squareAppSecret: parsed.SQUARE_APP_SECRET,
  squareEnv: parsed.SQUARE_ENV,
  squareRedirectUrl: parsed.SQUARE_REDIRECT_URL,
  cloverClientId: parsed.CLOVER_CLIENT_ID,
  cloverClientSecret: parsed.CLOVER_CLIENT_SECRET,
  cloverRedirectUrl: parsed.CLOVER_REDIRECT_URL,
  toastClientId: parsed.TOAST_CLIENT_ID,
  toastClientSecret: parsed.TOAST_CLIENT_SECRET,
  toastRedirectUrl: parsed.TOAST_REDIRECT_URL,
  stripeClientId: parsed.STRIPE_CLIENT_ID,
  stripeClientSecret: parsed.STRIPE_CLIENT_SECRET,
  stripeRedirectUrl: parsed.STRIPE_REDIRECT_URL,
  appStoreUrl: parsed.APP_STORE_URL,
  playStoreUrl: parsed.PLAY_STORE_URL,
  allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean),
  blockedIps: parsed.BLOCKED_IPS.split(',').map((item) => item.trim()).filter(Boolean),
} as const;

export type AppConfig = typeof config;


export type Role = 'customer' | 'vendor' | 'admin';

export interface JwtClaims {
  sub: string;
  role: Role;
  email?: string | null;
  exp?: number;
  iat?: number;
}

export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  status: string;
}

export interface VendorProfile {
  id: string;
  email: string;
  name: string;
  location: string | null;
  city: string | null;
  category: string | null;
  posType: string;
  status: string;
}

export interface AdminProfile {
  id: string;
  email: string;
  role: string;
}

export interface CardRecord {
  id: string;
  name: string;
  theme: string;
  description: string | null;
  image_url: string | null;
  expiration_date: string | null;
  max_uses: number | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface DiscountRule {
  id: string;
  card_id: string;
  vendor_id: string;
  type: 'fixed' | 'percent' | 'bogo';
  value: string | number;
  min_purchase: string | number;
  max_uses_total: number | null;
  max_uses_per_customer: number | null;
  uses_count: number;
  city_overrides: Record<string, { type?: 'fixed' | 'percent' | 'bogo'; value?: number }> | null;
  active: boolean;
}

export interface RedeemResult {
  valid: boolean;
  reason?: string;
  amountApplied?: number;
  discount?: {
    type: 'fixed' | 'percent' | 'bogo';
    value: number;
    instruction?: string;
  };
  redemptionId?: string;
  instruction?: string;
}

export interface PosConnectionRow {
  id: string;
  vendor_id: string;
  provider: PosProvider;
  mode: PosIntegrationMode;
  status: PosConnectionStatus;
  merchant_id: string | null;
  location_id: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  scope: string | null;
  last_synced_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type PosProvider = 'square' | 'clover' | 'toast' | 'stripe';
export type PosIntegrationMode = 'real' | 'simulated';
export type PosConnectionStatus = 'pending' | 'connected' | 'error' | 'disconnected';


const connectionString = config.databaseUrl;

if (!connectionString) {
  throw new Error('SUPABASE_DB_URL or DATABASE_URL is required');
}

const sql = postgres(connectionString, {
  ssl: config.pgSslMode === 'disable' ? false : 'require',
  max: 1,
});

export interface PoolClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export async function dbQuery<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  return await (sql.unsafe as unknown as (query: string, args?: unknown[]) => Promise<T[]>)(text, values as unknown[]);
}

export async function withDbClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  return await (sql.begin as unknown as <R>(cb: (tx: typeof sql) => Promise<R>) => Promise<R>)(async (tx) => {
    const client: PoolClient = {
      async query<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
        const command = text.trim().toUpperCase();
        if (command === 'BEGIN' || command === 'COMMIT' || command === 'ROLLBACK') {
          return { rows: [] as T[] };
        }
        const rows = await (tx.unsafe as unknown as (query: string, args?: unknown[]) => Promise<T[]>)(text, values as unknown[]);
        return { rows };
      },
    };
    return await handler(client);
  });
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}


export function signJwt(payload: { sub: string; role: Role; email?: string | null }): string {
  return jwt.sign({ ...payload, sub: payload.sub }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyJwt(token: string): JwtClaims {
  return jwt.verify(token, config.jwtSecret) as JwtClaims;
}


export function authenticate(request: Request): JwtClaims | null {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return null;
  }

  try {
    return verifyJwt(token);
  } catch {
    return null;
  }
}

export function requireRole(request: Request, roles: Role[]): JwtClaims | Response {
  const claims = authenticate(request);
  if (!claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (!roles.includes(claims.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  return claims;
}


export async function verifyCaptcha(token?: string | null): Promise<boolean> {
  if (!config.captchaProvider || !config.captchaSecret) {
    return true;
  }
  return Boolean(token);
}


export interface NormalizedDiscount {
  type: 'fixed' | 'percent' | 'bogo';
  value: number;
  minPurchase: number;
  cityOverrides: DiscountRule['city_overrides'];
}

export function normalizeNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function applyCityRules(discount: NormalizedDiscount, city?: string | null): NormalizedDiscount {
  if (!city || !discount.cityOverrides) {
    return discount;
  }
  const override = discount.cityOverrides[city.toLowerCase()] ?? discount.cityOverrides[city];
  if (!override) {
    return discount;
  }
  return {
    ...discount,
    type: override.type ?? discount.type,
    value: override.value ?? discount.value,
  };
}

export function computeDiscountAmount(input: { type: 'fixed' | 'percent' | 'bogo'; value: number; purchaseAmount?: number | null }): { amountApplied: number; instruction?: string } {
  if (input.type === 'percent') {
    const base = input.purchaseAmount ?? 0;
    return { amountApplied: Math.max(0, Math.round(base * (input.value / 100) * 100) / 100) };
  }
  if (input.type === 'bogo') {
    return { amountApplied: input.purchaseAmount ? Math.min(input.value, input.purchaseAmount) : input.value, instruction: 'Buy one, get one applied manually at register' };
  }
  return { amountApplied: input.value };
}

export function toAppliedDiscount(input: { type: 'fixed' | 'percent' | 'bogo'; value: number; purchaseAmount?: number | null }): { type: 'fixed' | 'percent' | 'bogo'; value: number; instruction?: string } {
  const computed = computeDiscountAmount(input);
  return { type: input.type, value: input.value, ...(computed.instruction ? { instruction: computed.instruction } : {}) };
}

export function buildLookupDiscountView(discount: DiscountRule, city?: string | null) {
  const normalized: NormalizedDiscount = {
    type: discount.type,
    value: normalizeNumber(discount.value),
    minPurchase: normalizeNumber(discount.min_purchase),
    cityOverrides: discount.city_overrides,
  };
  const adjusted = applyCityRules(normalized, city ?? null);
  return {
    id: discount.id,
    cardId: discount.card_id,
    vendorId: discount.vendor_id,
    type: adjusted.type,
    value: adjusted.value,
    minPurchase: adjusted.minPurchase,
    maxUsesTotal: discount.max_uses_total,
    maxUsesPerCustomer: discount.max_uses_per_customer,
    usesCount: discount.uses_count,
    cityOverrides: discount.city_overrides,
    active: discount.active,
  };
}


export async function getAdminAnalytics(filters: { from?: string; to?: string; city?: string }) {
  const where: string[] = [];
  const values: Array<string | null> = [];

  if (filters.from) {
    values.push(filters.from);
    where.push(`redeemed_at >= $${values.length}::timestamptz`);
  }
  if (filters.to) {
    values.push(filters.to);
    where.push(`redeemed_at <= $${values.length}::timestamptz`);
  }
  if (filters.city) {
    values.push(filters.city);
    where.push(`city = $${values.length}`);
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const totals = await dbQuery<{ redemptions: string; unique_customers: string }>(
    `SELECT COUNT(*)::text AS redemptions, COUNT(DISTINCT user_id)::text AS unique_customers FROM redemptions ${clause}`,
    values,
  );
  const vendorUsage = await dbQuery<{ vendor_id: string; vendor_name: string; redemptions: string }>(
    `SELECT v.id AS vendor_id, v.name AS vendor_name, COUNT(r.id)::text AS redemptions FROM redemptions r JOIN vendors v ON v.id = r.vendor_id ${clause} GROUP BY v.id, v.name ORDER BY COUNT(r.id) DESC`,
    values,
  );
  const cardUsage = await dbQuery<{ card_id: string; card_name: string; redemptions: string }>(
    `SELECT c.id AS card_id, c.name AS card_name, COUNT(r.id)::text AS redemptions FROM redemptions r JOIN cards c ON c.id = r.card_id ${clause} GROUP BY c.id, c.name ORDER BY COUNT(r.id) DESC`,
    values,
  );
  const timeSeries = await dbQuery<{ day: string; redemptions: string }>(
    `SELECT to_char(date_trunc('day', redeemed_at), 'YYYY-MM-DD') AS day, COUNT(*)::text AS redemptions FROM redemptions WHERE redeemed_at >= now() - interval '30 days' ${filters.city ? 'AND city = $1' : ''} GROUP BY 1 ORDER BY 1`,
    filters.city ? [filters.city] : [],
  );

  const topPerformers = vendorUsage.slice(0, 5);
  return {
    totals: {
      redemptions: Number(totals[0]?.redemptions ?? '0'),
      uniqueCustomers: Number(totals[0]?.unique_customers ?? '0'),
    },
    usageByVendor: vendorUsage.map((item) => ({ vendorId: item.vendor_id, vendorName: item.vendor_name, redemptions: Number(item.redemptions) })),
    usageByCard: cardUsage.map((item) => ({ cardId: item.card_id, cardName: item.card_name, redemptions: Number(item.redemptions) })),
    timeSeries: timeSeries.map((item) => ({ day: item.day, redemptions: Number(item.redemptions) })),
    topPerformers: topPerformers.map((item) => ({ vendorId: item.vendor_id, vendorName: item.vendor_name, redemptions: Number(item.redemptions) })),
  };
}

export async function getVendorAnalytics(vendorId: string) {
  const daily = await dbQuery<{ day: string; redemptions: string }>(
    `SELECT to_char(date_trunc('day', redeemed_at), 'YYYY-MM-DD') AS day, COUNT(*)::text AS redemptions FROM redemptions WHERE vendor_id = $1 GROUP BY 1 ORDER BY 1 DESC LIMIT 30`,
    [vendorId],
  );
  const cards = await dbQuery<{ card_id: string; card_name: string; redemptions: string; unique_customers: string }>(
    `SELECT c.id AS card_id, c.name AS card_name, COUNT(r.id)::text AS redemptions, COUNT(DISTINCT r.user_id)::text AS unique_customers FROM redemptions r JOIN cards c ON c.id = r.card_id WHERE r.vendor_id = $1 GROUP BY c.id, c.name ORDER BY COUNT(r.id) DESC`,
    [vendorId],
  );
  const aggregate = await dbQuery<{ redemptions: string; unique_customers: string }>(
    `SELECT COUNT(*)::text AS redemptions, COUNT(DISTINCT user_id)::text AS unique_customers FROM redemptions WHERE vendor_id = $1`,
    [vendorId],
  );
  return {
    totals: {
      redemptions: Number(aggregate[0]?.redemptions ?? '0'),
      uniqueCustomers: Number(aggregate[0]?.unique_customers ?? '0'),
    },
    daily: daily.map((item) => ({ day: item.day, redemptions: Number(item.redemptions) })),
    byCard: cards.map((item) => ({ cardId: item.card_id, cardName: item.card_name, redemptions: Number(item.redemptions), uniqueCustomers: Number(item.unique_customers) })),
  };
}


export function generateOpaqueToken(bytes = 18): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function generateTempPassword(): string {
  return generateOpaqueToken(9);
}


export async function writeTransactionAudit(input: {
  actorType: Role | 'system';
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  await dbQuery(
    `
      INSERT INTO transactions (actor_type, actor_id, action, entity_type, entity_id, metadata, ip)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [input.actorType, input.actorId ?? null, input.action, input.entityType, input.entityId ?? null, JSON.stringify(input.metadata ?? {}), input.ip ?? null],
  );
}


export async function resolvePassLookup(lookupToken: string, vendorId?: string, city?: string | null) {
  const passRows = await dbQuery<{
    pass_id: string;
    user_id: string;
    card_id: string;
    user_email: string | null;
    user_phone: string | null;
    user_full_name: string;
    card_name: string;
    card_theme: string;
    card_description: string | null;
    card_image_url: string | null;
    vendor_id: string | null;
    vendor_name: string | null;
  }>(
    `
      SELECT p.id AS pass_id,
             p.user_id,
             p.card_id,
             u.email AS user_email,
             u.phone AS user_phone,
             u.full_name AS user_full_name,
             c.name AS card_name,
             c.theme AS card_theme,
             c.description AS card_description,
             c.image_url AS card_image_url,
             v.id AS vendor_id,
             v.name AS vendor_name
      FROM passes p
      JOIN users u ON u.id = p.user_id
      JOIN cards c ON c.id = p.card_id
      LEFT JOIN vendors v ON v.id = $2::uuid
      WHERE p.lookup_token = $1
      LIMIT 1
    `,
    [lookupToken, vendorId ?? null],
  );

  if (passRows.length === 0) {
    return null;
  }

  const pass = passRows[0]!;
  const discounts = await dbQuery<DiscountRule>(
    `
      SELECT d.*
      FROM discounts d
      JOIN card_vendors cv ON cv.card_id = d.card_id AND cv.vendor_id = d.vendor_id
      WHERE d.card_id = $1
        AND ($2::uuid IS NULL OR d.vendor_id = $2::uuid)
        AND d.active = true
    `,
    [pass.card_id, vendorId ?? null],
  );

  return {
    pass,
    discounts: discounts.map((discount) => buildLookupDiscountView(discount, city)),
  };
}

export async function resolveCardLookup(cardId: string, vendorId?: string, city?: string | null) {
  const cardRows = await dbQuery<CardRecord & { vendor_name: string | null }>(
    `
      SELECT c.*, v.name AS vendor_name
      FROM cards c
      LEFT JOIN vendors v ON v.id = $2::uuid
      WHERE c.id = $1
      LIMIT 1
    `,
    [cardId, vendorId ?? null],
  );

  if (cardRows.length === 0) {
    return null;
  }

  const card = cardRows[0]!;
  const discounts = await dbQuery<DiscountRule>(
    `
      SELECT d.*
      FROM discounts d
      WHERE d.card_id = $1
        AND ($2::uuid IS NULL OR d.vendor_id = $2::uuid)
        AND d.active = true
    `,
    [cardId, vendorId ?? null],
  );

  return {
    card,
    discounts: discounts.map((discount) => buildLookupDiscountView(discount, city)),
  };
}


export interface RedeemInput {
  lookupToken?: string;
  cardId?: string;
  userId?: string;
  vendorId: string;
  discountId?: string;
  city?: string | null;
  purchaseAmount?: number | null;
  giftCardId?: string;
  actorType?: 'admin' | 'vendor' | 'customer' | 'system';
  actorId?: string | null;
  ip?: string | null;
}

function asNumeric(value: unknown): number {
  return normalizeNumber(typeof value === 'number' || typeof value === 'string' ? value : 0);
}

export async function redeemDiscount(input: RedeemInput): Promise<RedeemResult> {
  return await withDbClient(async (client) => {
    await client.query('BEGIN');
    try {
      const lookupRow = input.lookupToken
        ? await client.query<{ pass_id: string; user_id: string; card_id: string }>(
            `
              SELECT p.id AS pass_id, p.user_id, p.card_id
              FROM passes p
              WHERE p.lookup_token = $1
              LIMIT 1
            `,
            [input.lookupToken],
          )
        : { rows: [] };

      const userId = input.userId ?? lookupRow.rows[0]?.user_id ?? null;
      const cardId = input.cardId ?? lookupRow.rows[0]?.card_id ?? null;
      const passId = lookupRow.rows[0]?.pass_id ?? null;

      if (!cardId) {
        throw new Error('cardId or lookupToken is required');
      }

      const cardRows = await client.query<{ id: string; name: string; status: string; expiration_date: string | null; max_uses: number | null }>(
        'SELECT id, name, status, expiration_date, max_uses FROM cards WHERE id = $1 LIMIT 1',
        [cardId],
      );
      const card = cardRows.rows[0];
      if (!card) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Card not found' });
      }

      if (card.status !== 'active') {
        return await denyAndCommit(client, input, { valid: false, reason: 'Card is not active' }, userId, cardId, passId);
      }
      if (card.expiration_date && new Date(card.expiration_date).getTime() < Date.now()) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Card has expired' }, userId, cardId, passId);
      }

      const vendorParticipation = await client.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM card_vendors WHERE card_id = $1 AND vendor_id = $2) AS exists', [
        cardId,
        input.vendorId,
      ]);
      if (!vendorParticipation.rows[0]?.exists) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Vendor is not linked to this card' }, userId, cardId, passId);
      }

      const discountRows = await client.query<{
        id: string;
        card_id: string;
        vendor_id: string;
        type: 'fixed' | 'percent' | 'bogo';
        value: string;
        min_purchase: string;
        max_uses_total: number | null;
        max_uses_per_customer: number | null;
        uses_count: number;
        city_overrides: Record<string, { type?: 'fixed' | 'percent' | 'bogo'; value?: number }> | null;
        active: boolean;
      }>(
        `SELECT * FROM discounts WHERE card_id = $1 AND vendor_id = $2 ${input.discountId ? 'AND id = $3' : ''} FOR UPDATE`,
        input.discountId ? [cardId, input.vendorId, input.discountId] : [cardId, input.vendorId],
      );

      const discount = discountRows.rows[0];
      if (!discount) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Discount not found' }, userId, cardId, passId);
      }

      const adjustedDiscount = applyCityRules(
        {
          type: discount.type,
          value: asNumeric(discount.value),
          minPurchase: asNumeric(discount.min_purchase),
          cityOverrides: discount.city_overrides,
        },
        input.city ?? null,
      );

      if (!discount.active) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Discount is inactive' }, userId, cardId, passId);
      }
      if (discount.max_uses_total !== null && discount.uses_count >= discount.max_uses_total) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Discount limit reached' }, userId, cardId, passId);
      }
      if (discount.max_uses_per_customer !== null && userId) {
        const perCustomer = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM redemptions WHERE discount_id = $1 AND user_id = $2 AND status = \'approved\'', [
          discount.id,
          userId,
        ]);
        if (Number(perCustomer.rows[0]?.count ?? '0') >= discount.max_uses_per_customer) {
          return await denyAndCommit(client, input, { valid: false, reason: 'Customer limit reached' }, userId, cardId, passId);
        }
      }

      const cardUsage = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM redemptions WHERE card_id = $1 AND status = \'approved\'', [cardId]);
      if (card.max_uses !== null && Number(cardUsage.rows[0]?.count ?? '0') >= card.max_uses) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Card usage limit reached' }, userId, cardId, passId);
      }

      const amountInput = {
        type: adjustedDiscount.type,
        value: adjustedDiscount.value,
        ...(input.purchaseAmount !== undefined && input.purchaseAmount !== null ? { purchaseAmount: input.purchaseAmount } : {}),
      };
      const computed = computeDiscountAmount(amountInput);
      const applied = toAppliedDiscount(amountInput);
      const redemption = await client.query<{ id: string }>(
        `
          INSERT INTO redemptions (
            discount_id, gift_card_id, card_id, vendor_id, user_id, pass_id, amount_applied, city, status, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', NULL)
          RETURNING id
        `,
        [discount.id, input.giftCardId ?? null, cardId, input.vendorId, userId, passId, computed.amountApplied, input.city ?? null],
      );
      await client.query('UPDATE discounts SET uses_count = uses_count + 1, updated_at = now() WHERE id = $1', [discount.id]);
      if (input.giftCardId) {
        await client.query('UPDATE gift_cards SET balance = GREATEST(balance - $1, 0), updated_at = now() WHERE id = $2', [computed.amountApplied, input.giftCardId]);
      }
      await client.query(
        `
          INSERT INTO transactions (actor_type, actor_id, action, entity_type, entity_id, metadata, ip)
          VALUES ($1, $2, $3, 'redemption', $4, $5::jsonb, $6)
        `,
        [
          input.actorType ?? 'system',
          input.actorId ?? null,
          'redeem.approved',
          redemption.rows[0]!.id,
          JSON.stringify({ discountId: discount.id, cardId, vendorId: input.vendorId, amountApplied: computed.amountApplied, city: input.city ?? null }),
          input.ip ?? null,
        ],
      );

      await client.query('COMMIT');
      const success: RedeemResult = { valid: true, discount: applied, amountApplied: computed.amountApplied, redemptionId: redemption.rows[0]!.id };
      if (computed.instruction) {
        success.instruction = computed.instruction;
      }
      return success;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function denyAndCommit(
  client: PoolClient,
  input: RedeemInput,
  result: RedeemResult,
  userId?: string | null,
  cardId?: string | null,
  passId?: string | null,
): Promise<RedeemResult> {
  if (!cardId) {
    await client.query('COMMIT');
    return result;
  }

  const denied = await client.query<{ id: string }>(
    `
      INSERT INTO redemptions (
        discount_id, gift_card_id, card_id, vendor_id, user_id, pass_id, amount_applied, city, status, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'denied', $8)
      RETURNING id
    `,
    [input.discountId ?? null, input.giftCardId ?? null, cardId, input.vendorId, userId ?? null, passId ?? null, input.city ?? null, result.reason ?? 'Denied'],
  );

  await client.query(
    `
      INSERT INTO transactions (actor_type, actor_id, action, entity_type, entity_id, metadata, ip)
      VALUES ($1, $2, $3, 'redemption', $4, $5::jsonb, $6)
    `,
    [
      input.actorType ?? 'system',
      input.actorId ?? null,
      'redeem.denied',
      denied.rows[0]!.id,
      JSON.stringify({ reason: result.reason, discountId: input.discountId ?? null, cardId, vendorId: input.vendorId }),
      input.ip ?? null,
    ],
  );
  await client.query('COMMIT');
  return result;
}


export interface ApplePassInput {
  passId: string;
  serialNumber: string;
  lookupToken: string;
  authToken: string;
  cardName: string;
  description?: string | null;
  theme?: string;
}

export function buildApplePassJson(input: ApplePassInput) {
  return {
    formatVersion: 1,
    passTypeIdentifier: config.applePassTypeId || 'pass.com.example.mastercard',
    serialNumber: input.serialNumber,
    teamIdentifier: config.appleTeamId || 'TEAMID',
    organizationName: 'Master Gift/Discount Card System',
    description: input.description ?? input.cardName,
    backgroundColor: 'rgb(30,30,30)',
    foregroundColor: 'rgb(255,255,255)',
    labelColor: 'rgb(255,255,255)',
    userInfo: { passId: input.passId },
    generic: { primaryFields: [{ key: 'card', label: 'Card', value: input.cardName }] },
    barcodes: [{ message: input.lookupToken, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' }],
    nfc: { message: input.lookupToken, encryptionPublicKey: 'stubbed-public-key' },
  };
}

export function buildApplePassPackage(input: ApplePassInput) {
  const passJson = buildApplePassJson(input);
  return {
    status: config.appleCertPath ? 200 : 501,
    message: config.appleCertPath ? 'Signing path detected; unsigned pass metadata returned in this handoff' : 'Apple pass signing not configured',
    passJson,
  };
}

export function buildGoogleWalletLink(input: { passId: string; serialNumber: string; lookupToken: string; cardName: string }) {
  if (!config.googleWalletIssuerId || !config.googleWalletServiceAccountJson) {
    return { configured: false, message: 'Google Wallet not configured' };
  }
  return {
    configured: true,
    jwt: 'stubbed-google-wallet-jwt',
    saveUrl: 'https://pay.google.com/gp/v/save/stubbed-google-wallet-jwt',
  };
}


export interface PosStatePayload {
  vendorId: string;
  provider: PosProvider;
  issuedAt: number;
}

export interface PosConnectionSummary {
  id: string;
  provider: PosProvider;
  mode: PosIntegrationMode;
  status: PosConnectionStatus;
  merchantId: string | null;
  locationId: string | null;
  scope: string | null;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  latestSyncStatus: 'success' | 'error' | null;
  latestSyncMessage: string | null;
  latestSyncAt: string | null;
}

const PROVIDERS: PosProvider[] = ['square', 'clover', 'toast', 'stripe'];

function b64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function b64urlDecode(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function aesKeyBytes(): Uint8Array {
  const key = config.posTokenEncKey || 'dev-pos-token-encryption-key';
  return new Uint8Array(createHash('sha256').update(key).digest());
}

async function aesKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey('raw', aesKeyBytes() as unknown as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptPosToken(value: string): Promise<string> {
  const iv = randomBytes(12);
  const key = await aesKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(value) as unknown as BufferSource,
  );
  return ['v1', b64urlEncode(iv), b64urlEncode(new Uint8Array(encrypted))].join('.');
}

export async function decryptPosToken(value: string): Promise<string> {
  const [version, ivPart, encryptedPart] = value.split('.');
  if (version !== 'v1' || !ivPart || !encryptedPart) {
    throw new Error('Unsupported encrypted token payload');
  }
  const key = await aesKey();
  const iv = b64urlDecode(ivPart);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    b64urlDecode(encryptedPart) as unknown as BufferSource,
  );
  return new TextDecoder().decode(decrypted);
}

export function signPosState(payload: Omit<PosStatePayload, 'issuedAt'> & { issuedAt?: number }): string {
  const state: PosStatePayload = { ...payload, issuedAt: payload.issuedAt ?? Date.now() };
  const encoded = b64urlEncode(new TextEncoder().encode(JSON.stringify(state)));
  const signature = createHmac('sha256', config.posStateSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyPosState(value: string): PosStatePayload | null {
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) return null;
  const expected = createHmac('sha256', config.posStateSecret).update(encoded).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(encoded))) as Partial<PosStatePayload>;
    if (!parsed.vendorId || !parsed.provider || typeof parsed.issuedAt !== 'number') return null;
    return parsed as PosStatePayload;
  } catch {
    return null;
  }
}

function providerConfig(provider: PosProvider) {
  if (provider === 'square') {
    const authorizeBase =
      config.squareEnv === 'production' ? 'https://connect.squareup.com/oauth2/authorize' : 'https://connect.squareupsandbox.com/oauth2/authorize';
    const tokenUrl = config.squareEnv === 'production' ? 'https://connect.squareup.com/oauth2/token' : 'https://connect.squareupsandbox.com/oauth2/token';
    return { clientId: config.squareAppId, clientSecret: config.squareAppSecret, redirectUrl: config.squareRedirectUrl, authorizeBase, tokenUrl };
  }
  if (provider === 'clover') return { clientId: config.cloverClientId, clientSecret: config.cloverClientSecret, redirectUrl: config.cloverRedirectUrl };
  if (provider === 'toast') return { clientId: config.toastClientId, clientSecret: config.toastClientSecret, redirectUrl: config.toastRedirectUrl };
  return { clientId: config.stripeClientId, clientSecret: config.stripeClientSecret, redirectUrl: config.stripeRedirectUrl };
}

export async function listVendorConnections(vendorId: string): Promise<PosConnectionSummary[]> {
  const connections = await dbQuery<PosConnectionRow>('SELECT * FROM pos_connections WHERE vendor_id = $1 ORDER BY created_at DESC', [vendorId]);
  const logs = connections.length
    ? await dbQuery<{ connection_id: string; status: 'success' | 'error'; message: string | null; created_at: string }>(
        `SELECT connection_id, status, message, created_at FROM pos_sync_logs WHERE connection_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
        [connections.map((connection) => connection.id)],
      )
    : [];

  return connections.map((connection) => {
    const latest = logs.find((entry) => entry.connection_id === connection.id) ?? null;
    return {
      id: connection.id,
      provider: connection.provider,
      mode: connection.mode,
      status: connection.status,
      merchantId: connection.merchant_id,
      locationId: connection.location_id,
      scope: connection.scope,
      tokenExpiresAt: connection.token_expires_at,
      lastSyncedAt: connection.last_synced_at,
      lastErrorMessage: connection.last_error_message,
      createdAt: connection.created_at,
      updatedAt: connection.updated_at,
      latestSyncStatus: latest?.status ?? null,
      latestSyncMessage: latest?.message ?? null,
      latestSyncAt: latest?.created_at ?? null,
    };
  });
}

async function getConnectionByVendorProvider(vendorId: string, provider: PosProvider): Promise<PosConnectionRow | null> {
  const rows = await dbQuery<PosConnectionRow>('SELECT * FROM pos_connections WHERE vendor_id = $1 AND provider = $2 LIMIT 1', [vendorId, provider]);
  return rows[0] ?? null;
}

export async function connectVendorPosProvider(input: { vendorId: string; provider: PosProvider }) {
  const cfg = providerConfig(input.provider);
  const simulated = input.provider !== 'square' || !cfg.clientId || !cfg.clientSecret;
  const existing = await getConnectionByVendorProvider(input.vendorId, input.provider);

  if (simulated) {
    const merchantId = `${input.provider}_merchant_${input.vendorId.slice(0, 8)}`;
    const locationId = `${input.provider}_location_${input.vendorId.slice(0, 8)}`;
    const rows = existing
      ? await dbQuery<PosConnectionRow>(
          `UPDATE pos_connections SET mode = 'simulated', status = 'connected', merchant_id = COALESCE(merchant_id, $2), location_id = COALESCE(location_id, $3), updated_at = now() WHERE id = $1 RETURNING *`,
          [existing.id, merchantId, locationId],
        )
      : await dbQuery<PosConnectionRow>(
          `INSERT INTO pos_connections (vendor_id, provider, mode, status, merchant_id, location_id) VALUES ($1, $2, 'simulated', 'connected', $3, $4) RETURNING *`,
          [input.vendorId, input.provider, merchantId, locationId],
        );
    return { mode: 'simulated' as const, connection: rows[0]!, authorizeUrl: null, state: null, message: `Connected ${input.provider} in simulation mode` };
  }

  const state = signPosState({ vendorId: input.vendorId, provider: input.provider });
  const authorizeUrl = new URL(cfg.authorizeBase ?? 'https://example.com');
  authorizeUrl.searchParams.set('client_id', cfg.clientId);
  authorizeUrl.searchParams.set('scope', 'MERCHANT_PROFILE_READ PAYMENTS_READ ORDERS_READ');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('redirect_uri', cfg.redirectUrl);
  if (input.provider === 'square') {
    authorizeUrl.searchParams.set('session', 'false');
  }

  const rows = existing
    ? await dbQuery<PosConnectionRow>(`UPDATE pos_connections SET mode = 'real', status = 'pending', updated_at = now() WHERE id = $1 RETURNING *`, [existing.id])
    : await dbQuery<PosConnectionRow>(`INSERT INTO pos_connections (vendor_id, provider, mode, status) VALUES ($1, $2, 'real', 'pending') RETURNING *`, [input.vendorId, input.provider]);

  return { mode: 'real' as const, connection: rows[0]!, authorizeUrl: authorizeUrl.toString(), state, message: `Authorize ${input.provider} to connect` };
}

export async function handlePosOAuthCallback(input: { provider: PosProvider; code?: string; state?: string | null }) {
  if (!input.state) throw new Error('Missing state');
  const state = verifyPosState(input.state);
  if (!state || state.provider !== input.provider) throw new Error('Invalid state');

  const simulated = input.provider !== 'square' || !config.squareAppId || !config.squareAppSecret;
  const merchantId = `${input.provider}_merchant_${state.vendorId.slice(0, 8)}`;
  const locationId = `${input.provider}_location_${state.vendorId.slice(0, 8)}`;
  const accessTokenEnc = await encryptPosToken(input.code ?? `${input.provider}_access_${state.vendorId.slice(0, 8)}`);
  const refreshTokenEnc = await encryptPosToken(`${input.provider}_refresh_${state.vendorId.slice(0, 8)}`);
  const rows = await dbQuery<PosConnectionRow>(
    `
      INSERT INTO pos_connections (
        vendor_id, provider, mode, status, merchant_id, location_id, access_token_enc, refresh_token_enc, token_expires_at, scope, last_synced_at
      ) VALUES ($1, $2, $3, 'connected', $4, $5, $6, $7, now() + interval '30 days', $8, now())
      ON CONFLICT (vendor_id, provider) DO UPDATE SET
        mode = EXCLUDED.mode,
        status = EXCLUDED.status,
        merchant_id = EXCLUDED.merchant_id,
        location_id = EXCLUDED.location_id,
        access_token_enc = EXCLUDED.access_token_enc,
        refresh_token_enc = EXCLUDED.refresh_token_enc,
        token_expires_at = EXCLUDED.token_expires_at,
        scope = EXCLUDED.scope,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at = now()
      RETURNING *
    `,
    [
      state.vendorId,
      input.provider,
      simulated ? 'simulated' : 'real',
      merchantId,
      locationId,
      accessTokenEnc,
      refreshTokenEnc,
      'MERCHANT_PROFILE_READ PAYMENTS_READ ORDERS_READ',
    ],
  );
  return rows[0]!;
}

async function upsertExternalDiscount(connection: PosConnectionRow, discount: SyncDiscountRecord, action: 'upsert' | 'delete') {
  const externalDiscountId = `${connection.provider}_${discount.id.slice(0, 8)}`;
  if (action === 'delete') {
    await dbQuery('DELETE FROM pos_discount_mappings WHERE connection_id = $1 AND discount_id = $2', [connection.id, discount.id]);
  } else {
    await dbQuery(
      `
        INSERT INTO pos_discount_mappings (connection_id, discount_id, external_discount_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (connection_id, discount_id) DO UPDATE SET external_discount_id = EXCLUDED.external_discount_id, updated_at = now()
      `,
      [connection.id, discount.id, externalDiscountId],
    );
  }
  await dbQuery(
    `
      INSERT INTO pos_sync_logs (connection_id, discount_id, action, external_discount_id, status, message)
      VALUES ($1, $2, $3, $4, 'success', $5)
    `,
    [connection.id, discount.id, action, externalDiscountId, `${action} synced in ${connection.mode} mode`],
  );
  await dbQuery(`UPDATE pos_connections SET last_synced_at = now(), last_error_message = NULL, status = 'connected', updated_at = now() WHERE id = $1`, [connection.id]);
  return { externalDiscountId, status: 'success' as const };
}

export interface SyncDiscountRecord {
  id: string;
  card_id: string;
  vendor_id: string;
  type: string;
  value: string;
  min_purchase: string;
  max_uses_total: number | null;
  max_uses_per_customer: number | null;
  uses_count: number;
  city_overrides: unknown;
  active: boolean;
}

export async function syncDiscountToVendorConnections(input: { discountId: string; action: 'upsert' | 'delete' }) {
  const discounts = await dbQuery<SyncDiscountRecord>('SELECT * FROM discounts WHERE id = $1 LIMIT 1', [input.discountId]);
  const discount = discounts[0];
  if (!discount) return [];
  const connections = await dbQuery<PosConnectionRow>('SELECT * FROM pos_connections WHERE vendor_id = $1 AND status IN (\'connected\', \'pending\')', [discount.vendor_id]);
  const results: Array<{ connectionId: string; externalDiscountId: string; status: 'success' | 'error'; message?: string }> = [];
  for (const connection of connections) {
    try {
      const result = await upsertExternalDiscount(connection, discount, input.action);
      results.push({ connectionId: connection.id, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'POS sync failed';
      await dbQuery(
        `INSERT INTO pos_sync_logs (connection_id, discount_id, action, external_discount_id, status, message) VALUES ($1, $2, $3, NULL, 'error', $4)`,
        [connection.id, discount.id, input.action, message],
      );
      await dbQuery(`UPDATE pos_connections SET status = 'error', last_error_message = $2, updated_at = now() WHERE id = $1`, [connection.id, message]);
      results.push({ connectionId: connection.id, externalDiscountId: '', status: 'error', message });
    }
  }
  return results;
}

export async function deleteDiscountFromVendorConnections(input: { discountId: string }) {
  return await syncDiscountToVendorConnections({ discountId: input.discountId, action: 'delete' });
}

export async function getPosConnectionSummary(vendorId: string) {
  return await listVendorConnections(vendorId);
}

export async function disconnectVendorPosProvider(input: { vendorId: string; provider: PosProvider }) {
  const rows = await dbQuery<PosConnectionRow>(
    `UPDATE pos_connections SET status = 'disconnected', updated_at = now() WHERE vendor_id = $1 AND provider = $2 RETURNING *`,
    [input.vendorId, input.provider],
  );
  return rows[0] ?? null;
}

export async function getPosConnectionByProvider(vendorId: string, provider: PosProvider) {
  return await getConnectionByVendorProvider(vendorId, provider);
}

export async function finalizePosConnection(input: { stateToken: string; code?: string }) {
  const state = verifyPosState(input.stateToken);
  if (!state) throw new Error('Invalid state');
  const connection = await handlePosOAuthCallback({ provider: state.provider, code: input.code, state: input.stateToken });
  return { vendorId: state.vendorId, provider: state.provider, mode: connection.mode, connection };
}

export async function syncConnectionDiscountsByProvider(input: { vendorId: string; provider: PosProvider }) {
  const connection = await getConnectionByVendorProvider(input.vendorId, input.provider);
  if (!connection) return [];
  const discounts = await dbQuery<SyncDiscountRecord>('SELECT * FROM discounts WHERE vendor_id = $1 ORDER BY created_at DESC', [input.vendorId]);
  const results = [];
  for (const discount of discounts) {
    try {
      results.push(await upsertExternalDiscount(connection, discount, 'upsert'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'POS sync failed';
      await dbQuery(
        `INSERT INTO pos_sync_logs (connection_id, discount_id, action, external_discount_id, status, message) VALUES ($1, $2, 'upsert', NULL, 'error', $3)`,
        [connection.id, discount.id, message],
      );
      await dbQuery(`UPDATE pos_connections SET status = 'error', last_error_message = $2, updated_at = now() WHERE id = $1`, [connection.id, message]);
    }
  }
  return results;
}

export async function listProviders(): Promise<PosProvider[]> {
  return PROVIDERS;
}


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
  const path = url.pathname;

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
