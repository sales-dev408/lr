import { Buffer } from 'node:buffer';
import { config } from './config.ts';
import { dbQuery } from './db.ts';

export interface VendorPassInput {
  name: string;
  location: string;
  discountType: 'fixed' | 'percent';
  discountAmount: number;
  iconPng: string | undefined;
  logoPng: string | undefined;
}

export interface VendorPassResult {
  vendorPassId: string;
  discountCode: string;
  pkpassUrl: string;
  embedCode: string;
  instructions: string;
}

export interface VendorPassRecord {
  id: string;
  discount_type: string;
  discount_amount: string;
  discount_code: string;
  icon_png: string | null;
  logo_png: string | null;
  pkpass_base64: string | null;
}

const ADDPASS_BASE_URL = 'https://app.addpass.io/api/v1';

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex.slice(0, length).toUpperCase();
}

function buildDiscountCode(discountType: string, discountAmount: number): string {
  const suffix = randomHex(4);
  const amountInt = Math.floor(discountAmount);
  return `VEND-${discountType}-${amountInt}-${suffix}`;
}

function isPublicBaseUrl(baseUrl: string): boolean {
  if (!baseUrl) return false;
  try {
    const url = new URL(baseUrl);
    return !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function passImageUrl(vendorPassId: string, type: 'icon' | 'logo', baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/vendor-passes/${vendorPassId}/${type}.png`;
}

function buildPassPayload(input: VendorPassInput, record: VendorPassRecord, baseUrl: string): URLSearchParams {
  const code = record.discount_code;
  const amount = Number(record.discount_amount);
  const amountLabel = record.discount_type === 'percent' ? `${amount}% OFF` : `$${amount} OFF`;
  const params = new URLSearchParams();

  params.set('logoText', 'Light Rail Deals');
  params.set('backgroundColor', '#0F1219');
  params.set('foregroundColor', '#FFFFFF');
  params.set('labelColor', '#FFFFFF');
  params.set('primaryText', amountLabel);
  params.set('headerLabelRight', 'Vendor');
  params.set('headerTextRight', input.name.slice(0, 12));
  params.set('secondaryLabelLeft', 'Code');
  params.set('secondaryTextLeft', code);
  params.set('secondaryLabelRight', 'POS');
  params.set('secondaryTextRight', 'Scan or enter');
  params.set('auxiliaryLabelLeft', 'Location');
  params.set('auxiliaryTextLeft', input.location.slice(0, 40));
  params.set('serialNumber', code);
  params.set('barcode[format]', 'qr');
  params.set('barcode[message]', code);
  params.set('barcode[label]', 'Discount code');

  params.set('backFields[0][label]', 'Merchant');
  params.set('backFields[0][value]', input.name.slice(0, 40));
  params.set('backFields[1][label]', 'Instructions');
  params.set('backFields[1][value]', 'Show this pass at checkout. The cashier can scan the QR code or manually type the discount code.');

  if (isPublicBaseUrl(baseUrl)) {
    if (record.logo_png) {
      params.set('customLogoURL', passImageUrl(record.id, 'logo', baseUrl));
    }
    if (record.icon_png) {
      params.set('thumbnailURL', passImageUrl(record.id, 'icon', baseUrl));
    }
  }

  return params;
}

async function callAddPass(params: URLSearchParams, apiKey: string): Promise<Buffer> {
  const response = await fetch(`${ADDPASS_BASE_URL}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/pkpass',
    },
    body: params,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'AddPass request failed');
    throw new Error(`AddPass error ${response.status}: ${text.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

async function findExistingPass(discountType: string, discountAmount: number): Promise<VendorPassRecord | null> {
  const rows = await dbQuery<VendorPassRecord>(
    'SELECT * FROM vendor_passes WHERE discount_type = $1 AND discount_amount = $2 LIMIT 1',
    [discountType, discountAmount],
  );
  return rows[0] ?? null;
}

async function findPassById(id: string): Promise<VendorPassRecord | null> {
  const rows = await dbQuery<VendorPassRecord>('SELECT * FROM vendor_passes WHERE id = $1 LIMIT 1', [id]);
  return rows[0] ?? null;
}

export async function getOrCreateVendorPass(input: VendorPassInput): Promise<VendorPassResult> {
  const apiKey = config.addpassApiKey;
  const baseUrl = config.baseUrl;

  if (!apiKey) {
    throw new Error('ADDPASS_API_KEY is not configured');
  }

  const existing = await findExistingPass(input.discountType, input.discountAmount);
  if (existing?.pkpass_base64) {
    return buildResult(existing, baseUrl);
  }

  const discountCode = buildDiscountCode(input.discountType, input.discountAmount);

  const passInsert = await dbQuery<{ id: string }>(
    'INSERT INTO vendor_passes (discount_type, discount_amount, discount_code, icon_png, logo_png) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [input.discountType, input.discountAmount, discountCode, input.iconPng ?? null, input.logoPng ?? null],
  );
  const passId = passInsert[0]!.id;

  const record = await findPassById(passId);
  if (!record) {
    throw new Error('Failed to create vendor pass record');
  }

  const params = buildPassPayload(input, record, baseUrl);
  let pkpassBuffer: Buffer;

  try {
    pkpassBuffer = await callAddPass(params, apiKey);
  } catch {
    const retryParams = new URLSearchParams(params);
    retryParams.delete('customLogoURL');
    retryParams.delete('thumbnailURL');
    pkpassBuffer = await callAddPass(retryParams, apiKey);
  }

  const pkpassBase64 = pkpassBuffer.toString('base64');
  await dbQuery('UPDATE vendor_passes SET pkpass_base64 = $2, updated_at = now() WHERE id = $1', [passId, pkpassBase64]);
  record.pkpass_base64 = pkpassBase64;

  return buildResult(record, baseUrl);
}

function buildResult(record: VendorPassRecord, baseUrl: string): VendorPassResult {
  const pkpassUrl = `${baseUrl.replace(/\/$/, '')}/api/vendor-passes/${record.id}.pkpass`;
  const embedCode = `<a href="${pkpassUrl}" style="display:inline-block;padding:12px 20px;background:#000;color:#fff;border-radius:8px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">Add to Apple Wallet</a>`;
  const instructions = `Merchants can scan the QR code on the pass or manually enter the discount code ${record.discount_code} at the POS.`;

  return {
    vendorPassId: record.id,
    discountCode: record.discount_code,
    pkpassUrl,
    embedCode,
    instructions,
  };
}

export function getPassImageBase64(record: VendorPassRecord, type: 'icon' | 'logo'): string | null {
  return type === 'icon' ? record.icon_png : record.logo_png;
}

export async function getVendorPassById(id: string): Promise<VendorPassRecord | null> {
  const rows = await dbQuery<VendorPassRecord>('SELECT * FROM vendor_passes WHERE id = $1 LIMIT 1', [id]);
  return rows[0] ?? null;
}
