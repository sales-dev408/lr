export type CardTheme = 'sports' | 'entertainment' | 'shops_restaurants';
export type WalletPlatform = 'apple' | 'google';
export type DiscountType = 'fixed' | 'percent' | 'bogo';
export type CityOverrideMap = Record<string, { type?: DiscountType; value?: number }>;

export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  status: 'active' | 'suspended' | 'deleted';
}

export interface AuthResponse<TProfile> {
  token: string;
  expiresIn?: string;
  profile: TProfile;
}

export interface OnboardingResponse {
  theme: CardTheme;
  card: string;
  vendor: string;
  appStoreUrl: string;
  playStoreUrl: string;
}

export interface CardDiscount {
  id: string;
  cardId: string;
  vendorId: string;
  type: DiscountType;
  value: number;
  min_purchase: number;
  max_uses_total: number | null;
  max_uses_per_customer: number | null;
  uses_count: number;
  city_overrides: CityOverrideMap;
  active: boolean;
  applied?: {
    type: DiscountType;
    value: number;
    description: string;
    instruction?: string;
  };
}

export interface ParticipatingBusiness {
  id: string;
  name: string;
  city: string | null;
  discount: CardDiscount | null;
}

export interface CardSummary {
  id: string;
  name: string;
  theme: CardTheme;
  description: string | null;
  image_url: string | null;
  expiration_date: string | null;
  max_uses: number | null;
  status: string;
  participatingBusinesses: ParticipatingBusiness[];
}

export type CardDetail = CardSummary;

export interface WalletPassMetadata {
  passId: string;
  serialNumber: string;
  lookupToken: string;
  authToken: string;
  cardName: string;
  description: string | null;
}

export interface AppleWalletPayload {
  status: number;
  message: string;
  passJson: Record<string, unknown>;
  certificateLoaded?: boolean;
}

export interface GoogleWalletPayload {
  configured: boolean;
  message?: string;
  jwt?: string;
  saveUrl?: string;
}

export interface CreatePassResponse {
  pass: WalletPassMetadata;
  wallet: AppleWalletPayload | GoogleWalletPayload;
  downloadUrl: string;
}

export interface StoredPass extends WalletPassMetadata {
  platform: WalletPlatform;
  addedAt: string;
  walletMessage?: string;
  walletUrl?: string;
}

export interface PassDetail {
  id: string;
  user_id: string;
  card_id: string;
  platform: WalletPlatform;
  serial_number: string;
  auth_token: string;
  lookup_token: string;
  device_library_id: string | null;
  push_token: string | null;
  created_at: string;
  updated_at: string;
  card_name?: string;
  card_description?: string | null;
}

export interface LookupResult {
  pass?: {
    pass_id: string;
    user_id: string;
    card_id: string;
    user_email: string | null;
    user_phone: string | null;
    user_full_name: string;
    card_name: string;
    card_theme: CardTheme;
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
  discounts: {
    id: string;
    type: DiscountType;
    value: number;
    description: string;
    instruction?: string;
    cardId?: string;
    vendorId?: string;
  }[];
}

export interface Vendor {
  id: string;
  name: string;
  location: string | null;
  city: string | null;
  category: string | null;
  pos_type: string | null;
  discount_type: string | null;
  discount_amount: number | null;
  passUrl: string | null;
  status: string;
}

export interface RedeemResult {
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

export interface ErrorShape {
  error?: string | { code?: string; message?: string };
}
