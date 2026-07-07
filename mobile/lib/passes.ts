import { getItem, setItem } from './storage';
import type { StoredPass } from './types';

const PASSES_KEY = 'lr.mobile.passes';

export async function loadStoredPasses(): Promise<StoredPass[]> {
  const raw = await getItem(PASSES_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as StoredPass[];
  } catch {
    return [];
  }
}

export async function saveStoredPass(pass: StoredPass): Promise<void> {
  const current = await loadStoredPasses();
  const next = [pass, ...current.filter((item) => item.serialNumber !== pass.serialNumber)];
  await setItem(PASSES_KEY, JSON.stringify(next));
}

export async function upsertStoredPasses(passes: StoredPass[]): Promise<void> {
  await setItem(PASSES_KEY, JSON.stringify(passes));
}

export function lookupQrUrl(lookupToken: string): string {
  return `${process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000/api'}/qr/lookup/${encodeURIComponent(lookupToken)}.png`;
}
