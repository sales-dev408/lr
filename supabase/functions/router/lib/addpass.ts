import { config } from './config.ts';

export interface AddpassBarcode {
  format: 'qr' | 'aztec' | 'pdf417';
  message: string;
  messageEncoding?: string;
  label?: string;
}

export interface AddpassBackfield {
  label?: string;
  value: string;
}

export interface AddpassPayload {
  primaryText: string;
  logoText?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  labelColor?: string;
  headerLabelRight?: string;
  headerTextRight?: string;
  secondaryLabelLeft?: string;
  secondaryTextLeft?: string;
  secondaryLabelRight?: string;
  secondaryTextRight?: string;
  auxiliaryLabelLeft?: string;
  auxiliaryTextLeft?: string;
  auxiliaryLabelRight?: string;
  auxiliaryTextRight?: string;
  backfields?: AddpassBackfield[];
  barcode?: AddpassBarcode;
  qrCodeText?: string;
  thumbnailURL?: string;
  customLogoURL?: string;
  serialNumber?: string;
}

export interface AddpassJsonResult {
  passId: string;
  passUrl: string;
  expiresAt?: string;
}

export function addpassConfigured(): boolean {
  return Boolean(config.addpassApiKey);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }
  return out as T;
}

// Generates a pass and returns the AddPass-hosted download URL + passId (JSON mode).
export async function generatePkPassJson(payload: AddpassPayload): Promise<AddpassJsonResult> {
  if (!addpassConfigured()) {
    throw new Error('AddPass API key not configured (ADDPASS_API_KEY)');
  }
  const res = await fetch(`${config.addpassBaseUrl}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.addpassApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(stripUndefined(payload as unknown as Record<string, unknown>)),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`AddPass generation failed: ${res.status} ${String(body.error ?? body.message ?? '')}`);
  }
  return {
    passId: String(body.passId ?? ''),
    passUrl: String(body.passUrl ?? ''),
    ...(body.expiresAt ? { expiresAt: String(body.expiresAt) } : {}),
  };
}

// Generates a pass and returns the raw .pkpass bytes (streaming mode) so the
// backend can serve a stable "Add to Apple Wallet" download itself.
export async function streamPkPass(payload: AddpassPayload): Promise<Uint8Array> {
  if (!addpassConfigured()) {
    throw new Error('AddPass API key not configured (ADDPASS_API_KEY)');
  }
  const res = await fetch(`${config.addpassBaseUrl}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.addpassApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/pkpass',
    },
    body: JSON.stringify(stripUndefined(payload as unknown as Record<string, unknown>)),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(`AddPass generation failed: ${res.status} ${String(body.error ?? body.message ?? '')}`.trim());
  }
  return new Uint8Array(await res.arrayBuffer());
}
