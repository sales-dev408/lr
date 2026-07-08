import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { dbQuery, withDbClient } from '../db/pool.js';

export type PosProvider = 'square' | 'clover' | 'toast' | 'stripe';
export type PosConnectionStatus = 'pending' | 'connected' | 'error' | 'disconnected';
export type PosIntegrationMode = 'real' | 'simulated';
export type PosSyncAction = 'upsert' | 'delete';

export interface PosConnectionRecord {
  id: string;
  vendorId: string;
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
}

export interface PosConnectionRow {
  id: string;
  vendor_id: string;
  provider: PosProvider;
  mode: PosIntegrationMode;
  status: PosConnectionStatus;
  merchant_id: string | null;
  location_id: string | null;
  scope: string | null;
  token_expires_at: string | null;
  last_synced_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
}

export interface PosDiscountRecord {
  id: string;
  cardId: string;
  vendorId: string;
  cardName: string;
  cardTheme: string;
  cardDescription: string | null;
  vendorName: string;
  vendorCity: string | null;
  type: 'fixed' | 'percent' | 'bogo';
  value: number;
  minPurchase: number;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number | null;
  usesCount: number;
  cityOverrides: Record<string, { type?: 'fixed' | 'percent' | 'bogo'; value?: number }>;
  active: boolean;
}

export interface PosVendorConnectionView {
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

export interface PosSyncResult {
  connectionId: string;
  provider: PosProvider;
  action: PosSyncAction;
  status: 'success' | 'error';
  message: string | null;
  externalDiscountId: string | null;
}

interface PosStatePayload {
  vendorId: string;
  provider: PosProvider;
  mode: PosIntegrationMode;
  nonce: string;
  issuedAt: number;
}

interface PosAdapter {
  provider: PosProvider;
  mode: PosIntegrationMode;
  supportsAuthorizeUrl: boolean;
  getAuthorizeUrl(input: { state: string; redirectUrl: string }): string;
  exchangeCode(input: { code: string; state: PosStatePayload }): Promise<{
    merchantId: string;
    locationId: string | null;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
    scope: string | null;
    message: string;
  }>;
  upsertDiscount(input: {
    connection: PosConnectionRow;
    discount: PosDiscountRecord;
    externalDiscountId?: string | null;
  }): Promise<{ externalDiscountId: string; message: string }>;
  removeDiscount(input: {
    connection: PosConnectionRow;
    discount: PosDiscountRecord;
    externalDiscountId?: string | null;
  }): Promise<{ message: string }>;
  listLocations?(input: { connection: PosConnectionRow }): Promise<Array<{ id: string; name: string }>>;
}

const FALLBACK_TOKEN_KEY = 'lr-pos-token-dev-fallback';
const FALLBACK_STATE_KEY = 'lr-pos-state-dev-fallback';

function keyMaterial(raw: string | undefined, fallback: string): Buffer {
  return createHash('sha256').update(raw && raw.trim() ? raw.trim() : fallback).digest();
}

function tokenKey(): Buffer {
  return keyMaterial(config.posTokenEncKey, FALLBACK_TOKEN_KEY);
}

function stateKey(): Buffer {
  return keyMaterial(config.posStateSecret, FALLBACK_STATE_KEY);
}

export function encryptPosToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptPosToken(value: string): string {
  const [version, ivPart, tagPart, encryptedPart] = value.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !encryptedPart) {
    throw new Error('Unsupported encrypted token payload');
  }
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, 'base64url')), decipher.final()]).toString('utf8');
}

export function signPosState(payload: Omit<PosStatePayload, 'issuedAt'> & { issuedAt?: number }): string {
  const state: PosStatePayload = {
    ...payload,
    issuedAt: payload.issuedAt ?? Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  const signature = createHmac('sha256', stateKey()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyPosState(value: string): PosStatePayload | null {
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) {
    return null;
  }
  const expected = createHmac('sha256', stateKey()).update(encoded).digest('base64url');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as PosStatePayload;
    if (
      typeof parsed.vendorId !== 'string' ||
      typeof parsed.provider !== 'string' ||
      typeof parsed.mode !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.issuedAt !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isSquareRealMode(): boolean {
  return Boolean(config.squareAppId && config.squareAppSecret && config.squareRedirectUrl);
}

function squareBaseUrl(): string {
  return config.squareEnv === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

function squareApiBaseUrl(): string {
  return config.squareEnv === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

function providerMode(provider: PosProvider): PosIntegrationMode {
  return provider === 'square' && isSquareRealMode() ? 'real' : 'simulated';
}

function providerRedirectUrl(provider: PosProvider): string {
  if (provider === 'square') {
    return config.squareRedirectUrl;
  }
  if (provider === 'clover') {
    return config.cloverRedirectUrl;
  }
  if (provider === 'toast') {
    return config.toastRedirectUrl;
  }
  return config.stripeRedirectUrl;
}

function buildSimulationExternalId(connection: PosConnectionRow, discount: PosDiscountRecord): string {
  return `${connection.provider}-${connection.vendor_id.slice(0, 8)}-${discount.id.slice(0, 8)}`;
}

function buildConnectionRow(row: PosConnectionRow): PosConnectionRecord {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    merchantId: row.merchant_id,
    locationId: row.location_id,
    scope: row.scope,
    tokenExpiresAt: row.token_expires_at,
    lastSyncedAt: row.last_synced_at,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function recordSyncLog(input: {
  connectionId: string;
  discountId?: string | null;
  action: PosSyncAction;
  externalDiscountId?: string | null;
  status: 'success' | 'error';
  message?: string | null;
}): Promise<void> {
  await dbQuery(
    `
      INSERT INTO pos_sync_logs (connection_id, discount_id, action, external_discount_id, status, message)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.connectionId,
      input.discountId ?? null,
      input.action,
      input.externalDiscountId ?? null,
      input.status,
      input.message ?? null,
    ],
  );
}

async function markConnectionSynced(connectionId: string): Promise<void> {
  await dbQuery(
    `
      UPDATE pos_connections
      SET status = 'connected',
          last_synced_at = now(),
          last_error_message = NULL,
          updated_at = now()
      WHERE id = $1
    `,
    [connectionId],
  );
}

async function markConnectionErrored(connectionId: string, message: string): Promise<void> {
  await dbQuery(
    `
      UPDATE pos_connections
      SET status = 'error',
          last_error_message = $2,
          updated_at = now()
      WHERE id = $1
    `,
    [connectionId, message.slice(0, 500)],
  );
}

async function upsertConnectionRow(input: {
  vendorId: string;
  provider: PosProvider;
  mode: PosIntegrationMode;
  status: PosConnectionStatus;
  merchantId: string | null;
  locationId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
}): Promise<PosConnectionRecord> {
  const rows = await dbQuery<PosConnectionRow>(
    `
      INSERT INTO pos_connections (
        vendor_id, provider, mode, status, merchant_id, location_id, access_token_enc, refresh_token_enc,
        token_expires_at, scope, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      ON CONFLICT (vendor_id, provider) DO UPDATE
      SET mode = EXCLUDED.mode,
          status = EXCLUDED.status,
          merchant_id = EXCLUDED.merchant_id,
          location_id = EXCLUDED.location_id,
          access_token_enc = EXCLUDED.access_token_enc,
          refresh_token_enc = EXCLUDED.refresh_token_enc,
          token_expires_at = EXCLUDED.token_expires_at,
          scope = EXCLUDED.scope,
          updated_at = now()
      RETURNING *
    `,
    [
      input.vendorId,
      input.provider,
      input.mode,
      input.status,
      input.merchantId,
      input.locationId,
      input.accessToken ? encryptPosToken(input.accessToken) : null,
      input.refreshToken ? encryptPosToken(input.refreshToken) : null,
      input.expiresAt,
      input.scope,
    ],
  );
  return buildConnectionRow(rows[0]!);
}

async function getConnectionRow(vendorId: string, provider: PosProvider): Promise<PosConnectionRecord | null> {
  const rows = await dbQuery<PosConnectionRow>('SELECT * FROM pos_connections WHERE vendor_id = $1 AND provider = $2 LIMIT 1', [vendorId, provider]);
  return rows[0] ? buildConnectionRow(rows[0]) : null;
}

async function getConnectionRowById(connectionId: string): Promise<PosConnectionRow | null> {
  const rows = await dbQuery<PosConnectionRow>('SELECT * FROM pos_connections WHERE id = $1 LIMIT 1', [connectionId]);
  return rows[0] ?? null;
}

async function listConnectionsForVendor(vendorId: string): Promise<PosVendorConnectionView[]> {
  return dbQuery<PosVendorConnectionView>(
    `
      SELECT pc.id,
             pc.provider,
             pc.mode,
             pc.status,
             pc.merchant_id AS "merchantId",
             pc.location_id AS "locationId",
             pc.scope,
             pc.token_expires_at AS "tokenExpiresAt",
             pc.last_synced_at AS "lastSyncedAt",
             pc.last_error_message AS "lastErrorMessage",
             pc.created_at AS "createdAt",
             pc.updated_at AS "updatedAt",
             sl.status AS "latestSyncStatus",
             sl.message AS "latestSyncMessage",
             sl.created_at AS "latestSyncAt"
      FROM pos_connections pc
      LEFT JOIN LATERAL (
        SELECT status, message, created_at
        FROM pos_sync_logs
        WHERE connection_id = pc.id
        ORDER BY created_at DESC
        LIMIT 1
      ) sl ON true
      WHERE pc.vendor_id = $1
      ORDER BY pc.provider
    `,
    [vendorId],
  );
}

async function listVendorDiscounts(vendorId: string): Promise<PosDiscountRecord[]> {
  return dbQuery<PosDiscountRecord>(
    `
      SELECT d.id,
             d.card_id AS "cardId",
             d.vendor_id AS "vendorId",
             c.name AS "cardName",
             c.theme AS "cardTheme",
             c.description AS "cardDescription",
             v.name AS "vendorName",
             v.city AS "vendorCity",
             d.type,
             d.value::numeric,
             d.min_purchase::numeric AS "minPurchase",
             d.max_uses_total AS "maxUsesTotal",
             d.max_uses_per_customer AS "maxUsesPerCustomer",
             d.uses_count AS "usesCount",
             d.city_overrides AS "cityOverrides",
             d.active
      FROM discounts d
      JOIN cards c ON c.id = d.card_id
      JOIN vendors v ON v.id = d.vendor_id
      WHERE d.vendor_id = $1
      ORDER BY d.created_at DESC
    `,
    [vendorId],
  );
}

async function getDiscountRecord(discountId: string): Promise<PosDiscountRecord | null> {
  const rows = await dbQuery<PosDiscountRecord>(
    `
      SELECT d.id,
             d.card_id AS "cardId",
             d.vendor_id AS "vendorId",
             c.name AS "cardName",
             c.theme AS "cardTheme",
             c.description AS "cardDescription",
             v.name AS "vendorName",
             v.city AS "vendorCity",
             d.type,
             d.value::numeric,
             d.min_purchase::numeric AS "minPurchase",
             d.max_uses_total AS "maxUsesTotal",
             d.max_uses_per_customer AS "maxUsesPerCustomer",
             d.uses_count AS "usesCount",
             d.city_overrides AS "cityOverrides",
             d.active
      FROM discounts d
      JOIN cards c ON c.id = d.card_id
      JOIN vendors v ON v.id = d.vendor_id
      WHERE d.id = $1
      LIMIT 1
    `,
    [discountId],
  );
  return rows[0] ?? null;
}

async function getExternalDiscountId(connectionId: string, discountId: string): Promise<string | null> {
  const rows = await dbQuery<{ external_discount_id: string }>(
    'SELECT external_discount_id FROM pos_discount_mappings WHERE connection_id = $1 AND discount_id = $2 LIMIT 1',
    [connectionId, discountId],
  );
  return rows[0]?.external_discount_id ?? null;
}

async function setExternalDiscountId(connectionId: string, discountId: string, externalDiscountId: string): Promise<void> {
  await dbQuery(
    `
      INSERT INTO pos_discount_mappings (connection_id, discount_id, external_discount_id, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (connection_id, discount_id) DO UPDATE
      SET external_discount_id = EXCLUDED.external_discount_id,
          updated_at = now()
    `,
    [connectionId, discountId, externalDiscountId],
  );
}

async function deleteDiscountMapping(connectionId: string, discountId: string): Promise<void> {
  await dbQuery('DELETE FROM pos_discount_mappings WHERE connection_id = $1 AND discount_id = $2', [connectionId, discountId]);
}

function buildAdapter(provider: PosProvider, mode: PosIntegrationMode): PosAdapter {
  if (provider !== 'square' || mode === 'simulated') {
    return buildSimulationAdapter(provider, mode);
  }
  return buildSquareAdapter();
}

function buildSimulationAdapter(provider: PosProvider, mode: PosIntegrationMode): PosAdapter {
  return {
    provider,
    mode,
    supportsAuthorizeUrl: false,
    getAuthorizeUrl() {
      return '';
    },
    async exchangeCode(input) {
      const suffix = input.state.nonce.slice(0, 8);
      return {
        merchantId: `${provider}-merchant-${suffix}`,
        locationId: `${provider}-location-${suffix}`,
        accessToken: `sim-access-${provider}-${suffix}`,
        refreshToken: `sim-refresh-${provider}-${suffix}`,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
        scope: 'discounts.read discounts.write',
        message: `${provider} connection completed in simulation mode`,
      };
    },
    async upsertDiscount(input) {
      const externalDiscountId = input.externalDiscountId ?? buildSimulationExternalId(input.connection, input.discount);
      return {
        externalDiscountId,
        message: `${provider} simulated discount upserted`,
      };
    },
    async removeDiscount(input) {
      return {
        message: `${provider} simulated discount removed${input.externalDiscountId ? ` (${input.externalDiscountId})` : ''}`,
      };
    },
    async listLocations(input) {
      return [
        {
          id: input.connection.location_id ?? `${provider}-location`,
          name: `${provider.toUpperCase()} Demo Location`,
        },
      ];
    },
  };
}

function buildSquareAdapter(): PosAdapter {
  return {
    provider: 'square',
    mode: 'real',
    supportsAuthorizeUrl: true,
    getAuthorizeUrl(input) {
      const scope = encodeURIComponent(['ITEMS_READ', 'ITEMS_WRITE', 'ORDERS_READ', 'ORDERS_WRITE', 'PAYMENTS_READ'].join(' '));
      const state = encodeURIComponent(input.state);
      return `${squareBaseUrl()}/oauth2/authorize?client_id=${encodeURIComponent(config.squareAppId)}&scope=${scope}&session=false&state=${state}&redirect_uri=${encodeURIComponent(input.redirectUrl)}`;
    },
    async exchangeCode(input) {
      const tokenResponse = await fetch(`${squareApiBaseUrl()}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: config.squareAppId,
          client_secret: config.squareAppSecret,
          code: input.code,
          grant_type: 'authorization_code',
          redirect_uri: config.squareRedirectUrl,
        }),
      });
      if (!tokenResponse.ok) {
        const body = await tokenResponse.text();
        throw new Error(`Square token exchange failed: ${body}`);
      }
      const data = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_at?: string;
        merchant_id?: string;
        scope?: string;
      };
      let locationId: string | null = null;
      try {
        const locationsResponse = await fetch(`${squareApiBaseUrl()}/v2/locations`, {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: 'application/json',
          },
        });
        if (locationsResponse.ok) {
          const locations = (await locationsResponse.json()) as { locations?: Array<{ id: string }> };
          locationId = locations.locations?.[0]?.id ?? null;
        }
      } catch {
        locationId = null;
      }
      return {
        merchantId: data.merchant_id ?? input.state.vendorId,
        locationId,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: data.expires_at ?? null,
        scope: data.scope ?? null,
        message: 'Square connection completed',
      };
    },
    async upsertDiscount(input) {
      const name = `${input.discount.cardName} - ${input.discount.vendorName}`;
      const externalDiscountId = input.externalDiscountId ?? `square-${input.connection.id.slice(0, 8)}-${input.discount.id.slice(0, 8)}`;
      const accessToken = input.connection.access_token_enc ? decryptPosToken(input.connection.access_token_enc) : '';
      if (!accessToken) {
        throw new Error('Square access token missing');
      }
      const response = await fetch(`${squareApiBaseUrl()}/v2/catalog/object`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          idempotency_key: `${input.connection.id}-${input.discount.id}`,
          object: {
            type: 'DISCOUNT',
            id: `#${externalDiscountId}`,
            discount_data: {
              name,
              discount_type: input.discount.type === 'percent' ? 'FIXED_PERCENTAGE' : 'FIXED_AMOUNT',
            },
          },
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Square discount upsert failed: ${body}`);
      }
      return {
        externalDiscountId,
        message: 'Square discount synced',
      };
    },
    async removeDiscount(input) {
      if (!input.externalDiscountId) {
        return { message: 'Square discount mapping missing; nothing to remove' };
      }
      const accessToken = input.connection.access_token_enc ? decryptPosToken(input.connection.access_token_enc) : '';
      if (!accessToken) {
        throw new Error('Square access token missing');
      }
      const response = await fetch(`${squareApiBaseUrl()}/v2/catalog/object/${encodeURIComponent(input.externalDiscountId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Square discount remove failed: ${body}`);
      }
      return { message: 'Square discount removed' };
    },
    async listLocations(input) {
      const accessToken = input.connection.access_token_enc ? decryptPosToken(input.connection.access_token_enc) : '';
      if (!accessToken) {
        return [];
      }
      const response = await fetch(`${squareApiBaseUrl()}/v2/locations`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        return [];
      }
      const body = (await response.json()) as { locations?: Array<{ id: string; name: string }> };
      return body.locations ?? [];
    },
  };
}

async function syncOneDiscountToConnection(input: {
  connection: PosConnectionRow;
  discount: PosDiscountRecord;
  action: PosSyncAction;
}): Promise<PosSyncResult> {
  const adapter = buildAdapter(input.connection.provider, input.connection.mode);
  const externalId = await getExternalDiscountId(input.connection.id, input.discount.id);

  try {
    if (input.action === 'delete' || !input.discount.active) {
      const response = await adapter.removeDiscount({
        connection: input.connection,
        discount: input.discount,
        externalDiscountId: externalId ?? null,
      });
      if (externalId) {
        await deleteDiscountMapping(input.connection.id, input.discount.id);
      }
      await recordSyncLog({
        connectionId: input.connection.id,
        discountId: input.discount.id,
        action: 'delete',
        externalDiscountId: externalId,
        status: 'success',
        message: response.message,
      });
      await markConnectionSynced(input.connection.id);
      return {
        connectionId: input.connection.id,
        provider: input.connection.provider,
        action: 'delete',
        status: 'success',
        message: response.message,
        externalDiscountId: externalId,
      };
    }

    const response = await adapter.upsertDiscount({
      connection: input.connection,
      discount: input.discount,
      externalDiscountId: externalId,
    });
    await setExternalDiscountId(input.connection.id, input.discount.id, response.externalDiscountId);
    await recordSyncLog({
      connectionId: input.connection.id,
      discountId: input.discount.id,
      action: 'upsert',
      externalDiscountId: response.externalDiscountId,
      status: 'success',
      message: response.message,
    });
    await markConnectionSynced(input.connection.id);
    return {
      connectionId: input.connection.id,
      provider: input.connection.provider,
      action: 'upsert',
      status: 'success',
      message: response.message,
      externalDiscountId: response.externalDiscountId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'POS sync failed';
    await recordSyncLog({
      connectionId: input.connection.id,
      discountId: input.discount.id,
      action: input.action,
      externalDiscountId: externalId,
      status: 'error',
      message,
    });
    await markConnectionErrored(input.connection.id, message);
    return {
      connectionId: input.connection.id,
      provider: input.connection.provider,
      action: input.action,
      status: 'error',
      message,
      externalDiscountId: externalId,
    };
  }
}

async function getConnectionRowRaw(vendorId: string, provider: PosProvider): Promise<PosConnectionRow | null> {
  const rows = await dbQuery<PosConnectionRow>('SELECT * FROM pos_connections WHERE vendor_id = $1 AND provider = $2 LIMIT 1', [vendorId, provider]);
  return rows[0] ?? null;
}

export async function listVendorPosConnections(vendorId: string): Promise<PosVendorConnectionView[]> {
  return listConnectionsForVendor(vendorId);
}

export function getProviderMode(provider: PosProvider): PosIntegrationMode {
  return providerMode(provider);
}

export function buildPosAuthorizeUrl(provider: PosProvider, vendorId: string): { state: string; authorizeUrl: string; mode: PosIntegrationMode } {
  const mode = providerMode(provider);
  const state = signPosState({
    vendorId,
    provider,
    mode,
    nonce: randomBytes(12).toString('hex'),
  });
  const adapter = buildAdapter(provider, mode);
  const authorizeUrl = adapter.supportsAuthorizeUrl
    ? adapter.getAuthorizeUrl({ state, redirectUrl: providerRedirectUrl(provider) })
    : '';
  return { state, authorizeUrl, mode };
}

export async function connectVendorPosProvider(input: { vendorId: string; provider: PosProvider }): Promise<
  | { mode: 'simulated'; connection: PosConnectionRecord; authorizeUrl: null; message: string }
  | { mode: 'real'; connection: PosConnectionRecord; authorizeUrl: string; state: string; message: string }
> {
  const mode = providerMode(input.provider);
  const adapter = buildAdapter(input.provider, mode);
  const statePayload = {
    vendorId: input.vendorId,
    provider: input.provider,
    mode,
    nonce: randomBytes(12).toString('hex'),
  };
  const state = signPosState(statePayload);

  if (mode === 'real') {
    const connection = await upsertConnectionRow({
      vendorId: input.vendorId,
      provider: input.provider,
      mode,
      status: 'pending',
      merchantId: null,
      locationId: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      scope: null,
    });
    return {
      mode,
      connection,
      authorizeUrl: adapter.getAuthorizeUrl({ state, redirectUrl: providerRedirectUrl(input.provider) }),
      state,
      message: 'Redirect the vendor to the provider authorization page',
    };
  }

  const result = await adapter.exchangeCode({ code: 'simulation', state: { ...statePayload, issuedAt: Date.now() } });
  const connection = await upsertConnectionRow({
    vendorId: input.vendorId,
    provider: input.provider,
    mode,
    status: 'connected',
    merchantId: result.merchantId,
    locationId: result.locationId,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
    scope: result.scope,
  });
  const rawConnection = await getConnectionRowRaw(input.vendorId, input.provider);
  if (rawConnection) {
    await syncVendorDiscountsToConnection(rawConnection);
  }
  return {
    mode,
    connection,
    authorizeUrl: null,
    message: result.message,
  };
}

export async function finalizePosConnection(input: {
  stateToken: string;
  code: string;
}): Promise<{ vendorId: string; provider: PosProvider; mode: PosIntegrationMode; connection: PosConnectionRecord; message: string }> {
  const state = verifyPosState(input.stateToken);
  if (!state) {
    throw new Error('Invalid POS state');
  }
  const adapter = buildAdapter(state.provider, state.mode);
  const result =
    state.mode === 'real'
      ? await adapter.exchangeCode({ code: input.code, state })
      : await adapter.exchangeCode({ code: input.code, state });
  const connection = await upsertConnectionRow({
    vendorId: state.vendorId,
    provider: state.provider,
    mode: state.mode,
    status: 'connected',
    merchantId: result.merchantId,
    locationId: result.locationId,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
    scope: result.scope,
  });
  const rawConnection = await getConnectionRowRaw(state.vendorId, state.provider);
  if (rawConnection) {
    await syncVendorDiscountsToConnection(rawConnection);
  }
  return {
    vendorId: state.vendorId,
    provider: state.provider,
    mode: state.mode,
    connection,
    message: result.message,
  };
}

export async function disconnectVendorPosProvider(input: { vendorId: string; provider: PosProvider }): Promise<PosConnectionRecord | null> {
  const current = await getConnectionRow(input.vendorId, input.provider);
  if (!current) {
    return null;
  }
  await dbQuery(
    `
      UPDATE pos_connections
      SET status = 'disconnected',
          merchant_id = NULL,
          location_id = NULL,
          access_token_enc = NULL,
          refresh_token_enc = NULL,
          token_expires_at = NULL,
          scope = NULL,
          last_error_message = NULL,
          updated_at = now()
      WHERE id = $1
    `,
    [current.id],
  );
  return getConnectionRow(input.vendorId, input.provider);
}

export async function syncVendorDiscountsToConnection(connection: PosConnectionRow): Promise<PosSyncResult[]> {
  const discounts = await listVendorDiscounts(connection.vendor_id);
  const results: PosSyncResult[] = [];
  for (const discount of discounts) {
    results.push(await syncOneDiscountToConnection({ connection, discount, action: discount.active ? 'upsert' : 'delete' }));
  }
  return results;
}

export async function syncDiscountToVendorConnections(input: {
  discountId: string;
  action: PosSyncAction;
}): Promise<PosSyncResult[]> {
  const discount = await getDiscountRecord(input.discountId);
  if (!discount) {
    return [];
  }
  const connections = await listConnectionsForVendor(discount.vendorId);
  const results: PosSyncResult[] = [];
  for (const view of connections) {
    if (view.status !== 'connected') {
      continue;
    }
    const connection = await getConnectionRowById(view.id);
    if (!connection) {
      continue;
    }
    results.push(await syncOneDiscountToConnection({ connection, discount, action: input.action }));
  }
  return results;
}

export async function deleteDiscountFromVendorConnections(input: { discountId: string }): Promise<PosSyncResult[]> {
  return syncDiscountToVendorConnections({ discountId: input.discountId, action: 'delete' });
}

export async function getPosConnectionSummary(vendorId: string): Promise<PosVendorConnectionView[]> {
  return listConnectionsForVendor(vendorId);
}

export async function getPosConnectionByProvider(vendorId: string, provider: PosProvider): Promise<PosConnectionRecord | null> {
  return getConnectionRow(vendorId, provider);
}

export async function getPosDiscountRecord(discountId: string): Promise<PosDiscountRecord | null> {
  return getDiscountRecord(discountId);
}

export async function syncConnectionDiscountsByProvider(input: { vendorId: string; provider: PosProvider }): Promise<PosSyncResult[]> {
  const connection = await getConnectionRowRaw(input.vendorId, input.provider);
  if (!connection || connection.status !== 'connected') {
    return [];
  }
  return syncVendorDiscountsToConnection(connection);
}

export async function countConnectedPosProviders(vendorId: string): Promise<number> {
  const rows = await dbQuery<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM pos_connections WHERE vendor_id = $1 AND status = 'connected'",
    [vendorId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function runWithPosAutoSync<T>(handler: () => Promise<T>): Promise<T> {
  return withDbClient(handler);
}
