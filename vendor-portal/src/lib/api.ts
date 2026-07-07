import type { AuthResponse, LookupResponse, RedeemResponse, VendorAnalyticsResponse, VendorCard, VendorDiscount, VendorProfile } from './types';

const STORAGE_KEY = 'lr.vendor.auth';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = 'api_error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function baseUrl() {
  return import.meta.env.VITE_API_BASE_URL || '/api';
}

function pathJoin(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

export function getStoredToken(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

export function getStoredProfile(): VendorProfile | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { profile?: VendorProfile }).profile ?? null;
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: AuthResponse<VendorProfile>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function errorFromResponse(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const error = (body as { error: unknown }).error;
      if (typeof error === 'string') {
        return { code: 'api_error', message: error };
      }
      if (typeof error === 'object' && error !== null) {
        const err = error as { code?: unknown; message?: unknown };
        return {
          code: typeof err.code === 'string' ? err.code : 'api_error',
          message: typeof err.message === 'string' ? err.message : response.statusText || 'Request failed',
        };
      }
    }
    return { code: 'api_error', message: response.statusText || 'Request failed' };
  } catch {
    return { code: 'api_error', message: response.statusText || 'Request failed' };
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${pathJoin(path)}`, { ...init, headers });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'API unreachable', 0, 'network_error');
  }

  if (!response.ok) {
    const parsed = await errorFromResponse(response);
    throw new ApiError(parsed.message, response.status, parsed.code);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function jsonBody(body: unknown): string {
  return JSON.stringify(body);
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const result = search.toString();
  return result ? `?${result}` : '';
}

function normalizeDiscount(input: Record<string, unknown>): VendorDiscount {
  return {
    id: String(input.id),
    cardId: String(input.cardId ?? input.card_id ?? ''),
    vendorId: String(input.vendorId ?? input.vendor_id ?? ''),
    type: input.type as VendorDiscount['type'],
    value: Number(input.value ?? 0),
    min_purchase: Number(input.min_purchase ?? input.minPurchase ?? 0),
    max_uses_total: (input.max_uses_total ?? input.maxUsesTotal ?? null) as number | null,
    max_uses_per_customer: (input.max_uses_per_customer ?? input.maxUsesPerCustomer ?? null) as number | null,
    uses_count: Number(input.uses_count ?? input.usesCount ?? 0),
    city_overrides: (input.city_overrides ?? input.cityOverrides ?? {}) as VendorDiscount['city_overrides'],
    active: Boolean(input.active),
  };
}

function normalizeCard(input: Record<string, unknown>): VendorCard {
  const businesses = Array.isArray(input.participatingBusinesses)
    ? input.participatingBusinesses.map((item) => {
        const business = item as Record<string, unknown>;
        return {
          id: String(business.id),
          name: String(business.name),
          city: (business.city as string | null | undefined) ?? null,
          discount: business.discount ? normalizeDiscount(business.discount as Record<string, unknown>) : null,
        };
      })
    : [];
  return {
    id: String(input.id),
    name: String(input.name),
    theme: input.theme as VendorCard['theme'],
    description: (input.description as string | null | undefined) ?? null,
    image_url: (input.image_url as string | null | undefined) ?? null,
    expiration_date: (input.expiration_date as string | null | undefined) ?? null,
    max_uses: (input.max_uses as number | null | undefined) ?? null,
    status: String(input.status),
    discount: businesses.length > 0 ? businesses[0]?.discount ?? null : (input.discount ? normalizeDiscount(input.discount as Record<string, unknown>) : null),
  };
}

export async function loginVendor(body: { email: string; password: string; captchaToken?: string }): Promise<AuthResponse<VendorProfile>> {
  return apiRequest('/auth/vendor/login', { method: 'POST', body: jsonBody(body) });
}

export async function registerVendor(body: {
  name: string;
  location?: string;
  city?: string;
  category?: string;
  posType: string;
  email: string;
  password: string;
}): Promise<{ id: string; status: string }> {
  return apiRequest('/vendor/register', { method: 'POST', body: jsonBody(body) });
}

export async function getVendorCards(): Promise<VendorCard[]> {
  const cards = await apiRequest<Array<Record<string, unknown>>>('/vendor/cards');
  return cards.map(normalizeCard);
}

export async function updateVendorDiscount(id: string, body: {
  value?: number;
  minPurchase?: number;
  maxUsesPerCustomer?: number;
  active?: boolean;
  cityOverrides?: Record<string, { type?: string; value?: number }>;
}): Promise<VendorDiscount> {
  return apiRequest(`/vendor/discounts/${id}`, { method: 'PATCH', body: jsonBody(body) });
}

export async function getVendorAnalytics(period?: string): Promise<VendorAnalyticsResponse> {
  const response = await apiRequest<VendorAnalyticsResponse>(`/vendor/analytics${buildQuery({ period })}`);
  return response;
}

export async function lookupByToken(lookupToken: string, vendorId?: string, city?: string): Promise<LookupResponse> {
  return apiRequest(`/lookup/${lookupToken}${buildQuery({ vendorId, city })}`);
}

export async function lookupByCard(cardId: string, vendorId?: string, city?: string): Promise<LookupResponse> {
  return apiRequest(`/lookup/card/${cardId}${buildQuery({ vendorId, city })}`);
}

export async function redeem(body: {
  lookupToken?: string;
  cardId?: string;
  userId?: string;
  vendorId: string;
  discountId?: string;
  city?: string;
  purchaseAmount?: number;
}): Promise<RedeemResponse> {
  return apiRequest('/redeem', { method: 'POST', body: jsonBody(body) });
}
