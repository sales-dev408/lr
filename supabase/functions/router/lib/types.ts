export type Role = 'customer' | 'vendor' | 'admin';

export interface JwtClaims {
  sub: string;
  role: Role;
  email?: string | null;
  exp?: number;
  iat?: number;
}

export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  status: string;
}

export interface VendorProfile {
  id: string;
  email: string;
  name: string;
  location: string | null;
  city: string | null;
  category: string | null;
  posType: string;
  status: string;
}

export interface AdminProfile {
  id: string;
  email: string;
  role: string;
  fullName: string | null;
  location: string | null;
}

export interface CardRecord {
  id: string;
  name: string;
  theme: string;
  description: string | null;
  image_url: string | null;
  expiration_date: string | null;
  max_uses: number | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface DiscountRule {
  id: string;
  card_id: string;
  vendor_id: string;
  type: 'fixed' | 'percent' | 'bogo';
  value: string | number;
  min_purchase: string | number;
  max_uses_total: number | null;
  max_uses_per_customer: number | null;
  uses_count: number;
  city_overrides: Record<string, { type?: 'fixed' | 'percent' | 'bogo'; value?: number }> | null;
  active: boolean;
}

export interface RedeemResult {
  valid: boolean;
  reason?: string;
  amountApplied?: number;
  discount?: {
    type: 'fixed' | 'percent' | 'bogo';
    value: number;
    description: string;
    instruction?: string;
  };
  redemptionId?: string;
  instruction?: string;
}

export interface PosConnectionRow {
  id: string;
  vendor_id: string;
  provider: PosProvider;
  mode: PosIntegrationMode;
  status: PosConnectionStatus;
  merchant_id: string | null;
  location_id: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  scope: string | null;
  last_synced_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type PosProvider = 'square' | 'clover' | 'toast' | 'stripe';
export type PosIntegrationMode = 'real' | 'simulated';
export type PosConnectionStatus = 'pending' | 'connected' | 'error' | 'disconnected';
