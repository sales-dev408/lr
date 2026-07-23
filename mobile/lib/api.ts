import { getApiBaseUrl } from './config';
import { ApiError } from './errors';
import type {
  AuthResponse,
  CityOverrideMap,
  CardDiscount,
  CardDetail,
  DiscountType,
  CardSummary,
  CreatePassResponse,
  ErrorShape,
  LookupResult,
  OnboardingResponse,
  PassDetail,
  RedeemResult,
  UserProfile,
  VendorListItem,
  WalletPlatform,
} from './types';
import { getItem } from './storage';

const AUTH_STORAGE_KEY = 'lr.mobile.auth';

type StoredAuth = {
  token: string;
  profile: UserProfile;
};

function normalizeTheme(value: unknown): CardSummary['theme'] {
  return value === 'sports' || value === 'entertainment' || value === 'shops_restaurants' ? value : 'shops_restaurants';
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeDiscount(input: Record<string, unknown>): CardDiscount {
  const cityOverrides = (input.city_overrides ?? input.cityOverrides ?? {}) as CityOverrideMap;
  const applied = isRecord(input.applied)
    ? {
        type: normalizeDiscountType(input.applied.type),
        value: toNumber(input.applied.value),
        description: String(input.applied.description ?? ''),
        ...(typeof input.applied.instruction === 'string' ? { instruction: input.applied.instruction } : {}),
      }
    : undefined;

  return {
    id: String(input.id),
    cardId: String(input.cardId ?? input.card_id ?? ''),
    vendorId: String(input.vendorId ?? input.vendor_id ?? ''),
    type: normalizeDiscountType(input.type),
    value: toNumber(input.value),
    min_purchase: toNumber(input.min_purchase ?? input.minPurchase),
    max_uses_total: toNullableNumber(input.max_uses_total ?? input.maxUsesTotal),
    max_uses_per_customer: toNullableNumber(input.max_uses_per_customer ?? input.maxUsesPerCustomer),
    uses_count: toNumber(input.uses_count ?? input.usesCount),
    city_overrides: cityOverrides,
    active: Boolean(input.active),
    ...(applied ? { applied } : {}),
  };
}

function normalizeDiscountType(value: unknown): DiscountType {
  return value === 'fixed' || value === 'percent' || value === 'bogo' ? value : 'fixed';
}

function normalizeBusiness(input: Record<string, unknown>) {
  return {
    id: String(input.id),
    name: String(input.name),
    city: (input.city as string | null | undefined) ?? null,
    discount: input.discount && isRecord(input.discount) ? normalizeDiscount(input.discount) : null,
  };
}

function normalizeCard(input: Record<string, unknown>): CardSummary {
  const businesses = Array.isArray(input.participatingBusinesses) ? input.participatingBusinesses.map((item) => normalizeBusiness(item as Record<string, unknown>)) : [];
  return {
    id: String(input.id),
    name: String(input.name),
    theme: normalizeTheme(input.theme),
    description: (input.description as string | null | undefined) ?? null,
    image_url: (input.image_url as string | null | undefined) ?? (input.imageUrl as string | null | undefined) ?? null,
    expiration_date: (input.expiration_date as string | null | undefined) ?? (input.expirationDate as string | null | undefined) ?? null,
    max_uses: (input.max_uses as number | null | undefined) ?? (input.maxUses as number | null | undefined) ?? null,
    status: String(input.status),
    participatingBusinesses: businesses,
  };
}

function normalizePassDetail(input: Record<string, unknown>): PassDetail {
  return {
    id: String(input.id),
    user_id: String(input.user_id),
    card_id: String(input.card_id),
    platform: input.platform === 'google' ? 'google' : 'apple',
    serial_number: String(input.serial_number),
    auth_token: String(input.auth_token),
    lookup_token: String(input.lookup_token),
    device_library_id: (input.device_library_id as string | null | undefined) ?? null,
    push_token: (input.push_token as string | null | undefined) ?? null,
    created_at: String(input.created_at),
    updated_at: String(input.updated_at),
    card_name: (input.card_name as string | undefined) ?? undefined,
    card_description: (input.card_description as string | null | undefined) ?? undefined,
  };
}

async function getStoredAuth(): Promise<StoredAuth | null> {
  const raw = await getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

async function parseError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as ErrorShape;
    if (typeof body.error === 'string') {
      return { code: 'api_error', message: body.error };
    }
    if (body.error && typeof body.error === 'object') {
      return {
        code: typeof body.error.code === 'string' ? body.error.code : 'api_error',
        message: typeof body.error.message === 'string' ? body.error.message : response.statusText || 'Request failed',
      };
    }
    return { code: 'api_error', message: response.statusText || 'Request failed' };
  } catch {
    return { code: 'api_error', message: response.statusText || 'Request failed' };
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const auth = await getStoredAuth();
  if (auth?.token) {
    headers.set('Authorization', `Bearer ${auth.token}`);
  }
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'API unreachable', 0, 'network_error');
  }

  if (!response.ok) {
    const parsed = await parseError(response);
    throw new ApiError(parsed.message, response.status, parsed.code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(body: { email?: string; phone?: string; password: string }) {
  return apiRequest<AuthResponse<UserProfile>>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
}

export async function register(body: { email?: string; phone?: string; password: string; fullName: string; social?: string }) {
  return apiRequest<AuthResponse<UserProfile>>('/auth/register', { method: 'POST', body: JSON.stringify(body) });
}

function normalizeVendor(input: Record<string, unknown>): VendorListItem {
  const discount = isRecord(input.discount) ? input.discount : {};
  return {
    id: String(input.id),
    name: String(input.name),
    address: (input.address as string | null | undefined) ?? null,
    category: (input.category as string | null | undefined) ?? null,
    posSystem: (input.posSystem as string | null | undefined) ?? null,
    iconUrl: (input.iconUrl as string | null | undefined) ?? null,
    logoUrl: (input.logoUrl as string | null | undefined) ?? null,
    discount: {
      type: normalizeDiscountType(discount.type),
      value: toNumber(discount.value),
      label: String(discount.label ?? ''),
    },
    cardId: String(input.cardId ?? ''),
    walletUrl: input.walletUrl == null ? null : String(input.walletUrl),
  };
}

export async function listVendors(params: { category?: string } = {}) {
  const query = new URLSearchParams();
  if (params.category) {
    query.set('category', params.category);
  }
  const queryString = query.toString();
  const vendors = await apiRequest<Record<string, unknown>[]>(`/vendors${queryString ? `?${queryString}` : ''}`);
  return vendors.map(normalizeVendor);
}

export async function socialLogin(body: { provider: string; token: string; email?: string; fullName?: string }) {
  return apiRequest<AuthResponse<UserProfile>>('/auth/social', { method: 'POST', body: JSON.stringify(body) });
}

export async function getOnboarding(code: string) {
  return apiRequest<OnboardingResponse>(`/onboarding/${encodeURIComponent(code)}`);
}

export async function listCards(params: { theme?: string; city?: string }) {
  const query = new URLSearchParams();
  if (params.theme) {
    query.set('theme', params.theme);
  }
  if (params.city) {
    query.set('city', params.city);
  }
  const queryString = query.toString();
  const cards = await apiRequest<Record<string, unknown>[]>(`/cards${queryString ? `?${queryString}` : ''}`);
  return cards.map(normalizeCard);
}

export async function getCard(id: string, city?: string) {
  const query = city ? `?city=${encodeURIComponent(city)}` : '';
  const card = await apiRequest<Record<string, unknown>>(`/cards/${encodeURIComponent(id)}${query}`);
  return normalizeCard(card) as CardDetail;
}

// Fetches (creating if needed) the current member's single membership pass.
export async function getMyPass() {
  return apiRequest<CreatePassResponse>('/me/pass');
}

// Ensures the member's membership pass exists and returns it. `cardId` is
// accepted for backwards compatibility but ignored — there is one membership
// pass per user.
export async function createPass(body: { cardId?: string; platform?: WalletPlatform } = {}) {
  return apiRequest<CreatePassResponse>('/me/pass', {
    method: 'POST',
    body: JSON.stringify(body.platform ? { platform: body.platform } : {}),
  });
}

export async function getPass(serial: string) {
  const pass = await apiRequest<Record<string, unknown>>(`/passes/${encodeURIComponent(serial)}`);
  return normalizePassDetail(pass);
}

export async function lookupByToken(token: string, city?: string, vendorId?: string) {
  const query = new URLSearchParams();
  if (city) {
    query.set('city', city);
  }
  if (vendorId) {
    query.set('vendorId', vendorId);
  }
  const queryString = query.toString();
  return apiRequest<LookupResult>(`/lookup/${encodeURIComponent(token)}${queryString ? `?${queryString}` : ''}`);
}

export async function lookupByCard(cardId: string, city?: string, vendorId?: string) {
  const query = new URLSearchParams();
  if (city) {
    query.set('city', city);
  }
  if (vendorId) {
    query.set('vendorId', vendorId);
  }
  const queryString = query.toString();
  return apiRequest<LookupResult>(`/lookup/card/${encodeURIComponent(cardId)}${queryString ? `?${queryString}` : ''}`);
}

export async function redeem(body: {
  lookupToken?: string;
  cardId?: string;
  userId?: string;
  vendorId: string;
  discountId?: string;
  city?: string;
  purchaseAmount?: number;
}) {
  return apiRequest<RedeemResult>('/redeem', { method: 'POST', body: JSON.stringify(body) });
}
