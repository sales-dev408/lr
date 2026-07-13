import { config } from './config.ts';

export function storageConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) return null;
  const contentType = match[1] ?? 'image/png';
  const binary = atob(match[2] ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, contentType };
}

async function ensureBucket(): Promise<void> {
  const res = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      apikey: config.supabaseServiceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: config.storageBucket, name: config.storageBucket, public: true }),
  });
  // 200 = created, 400/409 = already exists; both are acceptable.
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to ensure storage bucket: ${res.status} ${text}`);
  }
}

export function publicStorageUrl(path: string): string {
  return `${config.supabaseUrl}/storage/v1/object/public/${config.storageBucket}/${path}`;
}

// Uploads a base64 data URL (or raw base64 PNG) and returns a public HTTPS URL,
// or null when storage is not configured. Throws only on unexpected failures.
export async function uploadImageDataUrl(path: string, dataUrl: string): Promise<string | null> {
  if (!storageConfigured() || !dataUrl) return null;
  const decoded = decodeDataUrl(dataUrl) ?? {
    bytes: Uint8Array.from(atob(dataUrl), (c) => c.charCodeAt(0)),
    contentType: 'image/png',
  };

  await ensureBucket();

  const res = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.storageBucket}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      apikey: config.supabaseServiceRoleKey,
      'Content-Type': decoded.contentType,
      'x-upsert': 'true',
    },
    body: decoded.bytes,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Storage upload failed: ${res.status} ${text}`);
  }

  return publicStorageUrl(path);
}
