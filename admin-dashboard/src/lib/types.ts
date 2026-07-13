export type AdminRole = 'owner' | 'admin' | 'analyst';
export type CardTheme = 'sports' | 'entertainment' | 'shops_restaurants';
export type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type CardStatus = 'draft' | 'active' | 'archived';
export type DiscountType = 'fixed' | 'percent' | 'bogo';
export type PosType = 'square' | 'stripe' | 'clover' | 'toast' | 'other';

export interface AdminProfile {
  id: string;
  email: string;
  role: AdminRole;
}

export interface AdminSettings {
  id: string;
  email: string;
  role: AdminRole;
  location: string | null;
}

export type VendorCategory = 'Sports' | 'Dining' | 'Entertainment';

export interface CreateVendorResult {
  vendor: { id: string; name: string; address: string | null; category: string; posSystem: string | null };
  discountCode: string;
  card: { id: string; name: string; reused: boolean; pkpassHostedUrl: string | null; iconUrl: string | null; logoUrl: string | null };
  wallet: { downloadUrl: string; embedHtml: string };
  posInstructions: string;
}

export interface VendorPassResult {
  discountCode: string;
  card: { id: string; name: string; pkpassHostedUrl: string | null };
  wallet: { downloadUrl: string; embedHtml: string };
  posInstructions: string;
}

export interface AuthResponse<TProfile> {
  token: string;
  expiresIn?: string;
  profile: TProfile;
}

export interface AdminAnalyticsResponse {
  totals: {
    redemptions: number;
    uniqueCustomers: number;
  };
  usageByVendor: Array<{
    vendorId: string;
    vendorName: string;
    redemptions: number;
  }>;
  usageByCard: Array<{
    cardId: string;
    cardName: string;
    redemptions: number;
  }>;
  timeSeries: Array<{
    day: string;
    redemptions: number;
  }>;
  topPerformers: Array<{
    vendorId: string;
    vendorName: string;
    redemptions: number;
  }>;
}

export interface VendorRecord {
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  city: string | null;
  category: string | null;
  pos_type: PosType;
  pos_system: string | null;
  icon_url: string | null;
  logo_url: string | null;
  email: string | null;
  status: VendorStatus;
  created_at?: string;
  updated_at?: string;
}

export interface VendorActivityRecord {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

export interface CardSummary {
  id: string;
  name: string;
  theme: CardTheme;
  description: string | null;
  image_url: string | null;
  expiration_date: string | null;
  max_uses: number | null;
  status: CardStatus;
  participatingBusinesses?: CardVendorSummary[];
}

export interface CardVendorSummary {
  id: string;
  name: string;
  city: string | null;
  discount: DiscountSummary | null;
}

export interface DiscountSummary {
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
  applied?: {
    type: DiscountType;
    value: number;
    description: string;
    instruction?: string;
  };
}

export interface CardDetailResponse extends CardSummary {
  participatingBusinesses: Array<{
    id: string;
    name: string;
    city: string | null;
    discount: DiscountSummary | null;
  }>;
}

export interface PublicCardsResponseItem {
  id: string;
  name: string;
  theme: CardTheme;
  description: string | null;
  image_url: string | null;
  expiration_date: string | null;
  max_uses: number | null;
  status: CardStatus;
  participatingBusinesses: Array<{
    id: string;
    name: string;
    city: string | null;
    discount: DiscountSummary | null;
  }>;
}
