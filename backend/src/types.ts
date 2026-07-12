export type Role = 'admin' | 'vendor' | 'customer';
export type ActorType = Role | 'system';
export type UserStatus = 'active' | 'suspended' | 'deleted';
export type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type AdminRole = 'owner' | 'admin' | 'analyst';
export type CardTheme = 'sports' | 'entertainment' | 'shops_restaurants';
export type CardStatus = 'draft' | 'active' | 'archived';
export type PosType = 'square' | 'stripe' | 'clover' | 'toast' | 'other';
export type DiscountType = 'fixed' | 'percent' | 'bogo';
export type PassPlatform = 'apple' | 'google';
export type RedemptionStatus = 'approved' | 'denied';

export interface JwtClaims {
  sub: string;
  role: Role;
  email?: string | null;
}

export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  status: UserStatus;
}

export interface VendorProfile {
  id: string;
  name: string;
  location: string | null;
  city: string | null;
  category: string | null;
  posType: PosType;
  email: string;
  status: VendorStatus;
}

export interface AdminProfile {
  id: string;
  email: string;
  role: AdminRole;
  fullName: string | null;
  location: string | null;
}

export interface CardRecord {
  id: string;
  name: string;
  theme: CardTheme;
  description: string | null;
  imageUrl: string | null;
  expirationDate: string | null;
  maxUses: number | null;
  status: CardStatus;
}

export interface DiscountRule {
  id: string;
  cardId: string;
  vendorId: string;
  type: DiscountType;
  value: string;
  minPurchase: string;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number | null;
  usesCount: number;
  cityOverrides: CityOverrideMap;
  active: boolean;
}

export interface CityDiscountOverride {
  type?: DiscountType;
  value?: number;
}

export type CityOverrideMap = Record<string, CityDiscountOverride>;

export interface AppliedDiscount {
  type: DiscountType;
  value: number;
  description: string;
  instruction?: string;
}

export interface RedeemResult {
  valid: boolean;
  reason?: string;
  discount?: AppliedDiscount;
  amountApplied?: number;
  instruction?: string;
  redemptionId?: string;
}

export interface LookupDiscountView extends Omit<DiscountRule, 'value' | 'cityOverrides' | 'minPurchase'> {
  value: number;
  minPurchase: number;
  cityOverrides: CityOverrideMap;
  applied: AppliedDiscount;
}
