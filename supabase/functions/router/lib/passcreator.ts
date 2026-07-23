import { config } from './config.ts';

// Thin client for the Passcreator REST API (v3). Passcreator hosts the wallet
// pass (Apple Wallet + Google Wallet) and returns stable download links, so the
// router never has to sign .pkpass bundles itself.
//
// Docs: https://app.passcreator.com/api/v3/pass
// Auth: an "Authorization: <apiKey>" header (no Bearer prefix).

export interface CreatePassInput {
  // Unique, stable id for this pass in the Passcreator account (we use the pass
  // serial number). Lets us dedupe / update the same member pass later.
  userProvidedId: string;
  // Value encoded in the pass barcode. For the membership model this is the
  // member's opaque lookup token, which a business scans at checkout.
  barcodeValue: string;
  // Optional template field values (must match fields defined on the template).
  fields?: Record<string, string>;
  // Optional per-pass overrides.
  thumbnailUrl?: string | null;
  logoUrl?: string | null;
}

export interface PasscreatorPass {
  identifier: string;
  downloadPage: string;
  iPhoneUri: string;
  androidUri?: string;
  barcodeValue?: string;
}

export function passcreatorConfigured(): boolean {
  return Boolean(config.passcreatorApiKey && config.passcreatorTemplateId);
}

function authHeaders(): HeadersInit {
  return {
    Authorization: config.passcreatorApiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }
  return out;
}

function toPass(body: Record<string, unknown>): PasscreatorPass {
  const data = (body.data ?? body) as Record<string, unknown>;
  return {
    identifier: String(data.identifier ?? ''),
    downloadPage: String(data.downloadPage ?? ''),
    iPhoneUri: String(data.iPhoneUri ?? ''),
    ...(data.androidUri ? { androidUri: String(data.androidUri) } : {}),
    ...(data.barcodeValue ? { barcodeValue: String(data.barcodeValue) } : {}),
  };
}

// Creates a wallet pass from the configured membership template. `async=false`
// makes Passcreator return the resolved barcodeValue + download links in the
// response body instead of processing the request in the background.
export async function createPass(input: CreatePassInput): Promise<PasscreatorPass> {
  if (!passcreatorConfigured()) {
    throw new Error('Passcreator is not configured (PASSCREATOR_API_KEY and PASSCREATOR_TEMPLATE_ID required)');
  }
  const data = stripUndefined({
    templateId: config.passcreatorTemplateId,
    userProvidedId: input.userProvidedId,
    enforceUniqueUserProvidedId: false,
    barcodeValue: input.barcodeValue,
    ...(input.thumbnailUrl ? { urlToThumbnail: input.thumbnailUrl } : {}),
    ...(input.logoUrl ? { urlToLogo: input.logoUrl } : {}),
    ...(input.fields ?? {}),
  });
  const res = await fetch(`${config.passcreatorBaseUrl}/pass?async=false`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ data }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    const errors = Array.isArray(body.errors) ? body.errors.join('; ') : '';
    throw new Error(`Passcreator create failed: ${res.status} ${String(body.description ?? '')} ${errors}`.trim());
  }
  return toPass(body);
}

// Updates an existing pass (PATCH keeps fields that are not supplied). Used to
// keep the barcode / member fields in sync after a pass already exists.
export async function updatePass(identifier: string, patch: { barcodeValue?: string; fields?: Record<string, string> }): Promise<void> {
  if (!passcreatorConfigured()) {
    throw new Error('Passcreator is not configured');
  }
  const data = stripUndefined({ ...(patch.barcodeValue ? { barcodeValue: patch.barcodeValue } : {}), ...(patch.fields ?? {}) });
  if (Object.keys(data).length === 0) return;
  const res = await fetch(`${config.passcreatorBaseUrl}/pass/${encodeURIComponent(identifier)}?async=false`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(`Passcreator update failed: ${res.status} ${String(body.description ?? '')}`.trim());
  }
}
