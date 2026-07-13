// OCR helpers backed by Puter.js (window.puter.ai.img2txt) — a free, unlimited,
// key-less OCR service loaded via the script tag in index.html.
// Docs: https://developer.puter.com/tutorials/how-to-perform-ocr-in-javascript/

interface PuterAI {
  img2txt: (input: File | Blob | string) => Promise<string>;
}

interface PuterGlobal {
  ai: PuterAI;
}

declare global {
  interface Window {
    puter?: PuterGlobal;
  }
}

export interface ParsedVendorFields {
  name?: string;
  address?: string;
  posSystem?: string;
  discountKind?: 'percent' | 'fixed';
  discountValue?: string;
  category?: 'Sports' | 'Dining' | 'Entertainment';
}

export async function scanImageToText(file: File): Promise<string> {
  const puter = window.puter;
  if (!puter?.ai?.img2txt) {
    throw new Error('OCR is unavailable — the Puter.js script failed to load.');
  }
  const text = await puter.ai.img2txt(file);
  return typeof text === 'string' ? text : '';
}

const KNOWN_POS = ['square', 'toast', 'clover', 'stripe', 'shopify', 'lightspeed', 'aloha', 'micros', 'revel', 'touchbistro'];

// Best-effort extraction of vendor fields from raw OCR text. Everything is
// optional and the admin always reviews/edits before submitting.
export function parseVendorFields(raw: string): ParsedVendorFields {
  const result: ParsedVendorFields = {};
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return result;

  // Name: first line with letters that isn't obviously an address/phone/discount.
  const nameLine = lines.find(
    (line) => /[a-zA-Z]{2,}/.test(line) && !/\d{3,}/.test(line) && !/%|\$|off/i.test(line),
  );
  if (nameLine) result.name = nameLine.slice(0, 80);

  // Address: a line containing a street-number + street-type or ZIP.
  const addressLine = lines.find((line) =>
    /\d{1,6}\s+\w+.*(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|ct|court|hwy|pkwy)\b/i.test(line) ||
    /\b\d{5}(-\d{4})?\b/.test(line),
  );
  if (addressLine) result.address = addressLine.slice(0, 160);

  // Discount: "15% off" / "$10 off" / "20 percent".
  const joined = lines.join(' ');
  const pct = joined.match(/(\d{1,3})\s*%/) ?? joined.match(/(\d{1,3})\s*percent/i);
  const usd = joined.match(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/);
  if (pct) {
    result.discountKind = 'percent';
    result.discountValue = pct[1];
  } else if (usd) {
    result.discountKind = 'fixed';
    result.discountValue = usd[1];
  }

  // POS system: match a known POS keyword anywhere.
  const posMatch = KNOWN_POS.find((pos) => new RegExp(`\\b${pos}\\b`, 'i').test(joined));
  if (posMatch) result.posSystem = posMatch.charAt(0).toUpperCase() + posMatch.slice(1);

  // Category: keyword heuristics.
  if (/\b(gym|sport|fitness|athletic|golf|stadium|arena)\b/i.test(joined)) result.category = 'Sports';
  else if (/\b(restaurant|diner|cafe|coffee|bar|grill|kitchen|bistro|eatery|pizza|food)\b/i.test(joined)) result.category = 'Dining';
  else if (/\b(theater|theatre|cinema|movie|concert|museum|entertainment|club|lounge)\b/i.test(joined)) result.category = 'Entertainment';

  return result;
}
