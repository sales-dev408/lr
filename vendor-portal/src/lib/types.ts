export type VendorRole = 'vendor';
export type DiscountType = 'fixed' | 'percent' | 'bogo';
export type CardTheme = 'sports' | 'entertainment' | 'shops_restaurants';
export type PosProvider = 'square' | 'clover' | 'toast' | 'stripe';
export type PosConnectionStatus = 'pending' | 'connected' | 'error' | 'disconnected';
export type PosIntegrationMode = 'real' | 'simulated';

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

export interface AuthResponse<TProfile> {
  token: string;
  profile: TProfile;
}

export interface VendorCard {
  id: string;
  name: string;
  theme: CardTheme;
  description: string | null;
  image_url: string | null;
  expiration_date: string | null;
  max_uses: number | null;
  status: string;
  discount: VendorDiscount | null;
}

export interface VendorDiscount {
  id: string;
  cardId: string;
  vendorId: string;
  type: DiscountType;
  value: number;
  min_purchase: number;
  max_uses_total: number | null;
  max_uses_per_customer: number | null;
  uses_count: number;
  city_overrides: Record<string, { type?: DiscountType; value?: number }>;
  active: boolean;
}

export interface VendorAnalyticsResponse {
  totals: {
    redemptions: number;
    uniqueCustomers: number;
  };
  daily: Array<{ day: string; redemptions: number }>;
  byCard: Array<{ cardId: string; cardName: string; redemptions: number; uniqueCustomers: number }>;
}

export interface PosConnectionView {
  id: string;
  provider: PosProvider;
  mode: PosIntegrationMode;
  status: PosConnectionStatus;
  merchantId: string | null;
  locationId: string | null;
  scope: string | null;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  latestSyncStatus: 'success' | 'error' | null;
  latestSyncMessage: string | null;
  latestSyncAt: string | null;
}

export interface PosConnectResponse {
  provider: PosProvider;
  mode: PosIntegrationMode;
  status: PosConnectionStatus;
  connection: PosConnectionView;
  message: string;
  authorizeUrl?: string | null;
  state?: string | null;
}

export interface PosSyncResponse {
  provider: PosProvider;
  synced: number;
  status: PosConnectionStatus;
  results: Array<{
    connectionId: string;
    provider: PosProvider;
    action: 'upsert' | 'delete';
    status: 'success' | 'error';
    message: string | null;
    externalDiscountId: string | null;
  }>;
}

export interface LookupResponse {
  pass?: {
    pass_id: string;
    user_id: string;
    card_id: string;
    user_email: string | null;
    user_phone: string | null;
    user_full_name: string;
    card_name: string;
    card_theme: string;
    card_description: string | null;
    card_image_url: string | null;
    vendor_id: string | null;
    vendor_name: string | null;
  };
  card?: {
    id: string;
    name: string;
    theme: CardTheme;
    description: string | null;
    image_url: string | null;
    expiration_date: string | null;
    max_uses: number | null;
    status: string;
  };
  discounts: Array<{
    id: string;
    type: DiscountType;
    value: number;
    description: string;
    instruction?: string;
    cardId?: string;
    vendorId?: string;
  }>;
}

export interface RedeemResponse {
  valid: boolean;
  reason?: string;
  discount?: {
    type: DiscountType;
    value: number;
    description: string;
  };
  amountApplied?: number;
  instruction?: string;
  redemptionId?: string;
}
