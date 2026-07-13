// Human-readable, POS-friendly discount code helpers.
// Codes only contain uppercase letters, digits, and hyphens (no spaces) so a
// cashier can key them in manually or scan them as a Code128 / QR barcode.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

export type DiscountType = 'fixed' | 'percent' | 'bogo';

export function randomSuffix(length = 4): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return out;
}

// A short, stable, POS-friendly merchant identifier derived from a name/id.
export function merchantSlug(input: string, length = 6): string {
  const cleaned = input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned.length >= length) {
    return cleaned.slice(0, length);
  }
  return (cleaned + randomSuffix(length)).slice(0, length);
}

// Encodes a discount amount into a compact token, e.g. 15 percent -> "15PCT",
// $10 fixed -> "10USD", BOGO -> "BOGO".
export function discountAmountToken(type: DiscountType, value: number): string {
  const normalized = Number.isInteger(value) ? String(value) : String(value).replace('.', 'P');
  if (type === 'percent') return `${normalized}PCT`;
  if (type === 'fixed') return `${normalized}USD`;
  return 'BOGO';
}

export function humanDiscountLabel(type: DiscountType, value: number): string {
  if (type === 'percent') return `${value}% Off`;
  if (type === 'fixed') return `$${value} Off`;
  return 'Buy One Get One';
}

export interface DiscountCodeInput {
  merchantId: string;
  type: DiscountType;
  value: number;
  suffix?: string;
}

// VEND-{merchantId}-{discountAmount}-{randomSuffix}
export function generateDiscountCode(input: DiscountCodeInput): string {
  const merchant = merchantSlug(input.merchantId);
  const amount = discountAmountToken(input.type, input.value);
  const suffix = input.suffix ?? randomSuffix(4);
  return `VEND-${merchant}-${amount}-${suffix}`;
}
