import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.ts';
import { dbQuery } from './db.ts';
import type { PosConnectionRow, PosConnectionStatus, PosIntegrationMode, PosProvider } from './types.ts';

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
