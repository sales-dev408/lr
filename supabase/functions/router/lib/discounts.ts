import type { DiscountRule } from './types.ts';

export interface NormalizedDiscount {
  type: 'fixed' | 'percent' | 'bogo';
  value: number;
  minPurchase: number;
  cityOverrides: DiscountRule['city_overrides'];
}

export function normalizeNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function applyCityRules(discount: NormalizedDiscount, city?: string | null): NormalizedDiscount {
  if (!city || !discount.cityOverrides) {
    return discount;
  }
  const override = discount.cityOverrides[city.toLowerCase()] ?? discount.cityOverrides[city];
  if (!override) {
    return discount;
  }
  return {
    ...discount,
    type: override.type ?? discount.type,
    value: override.value ?? discount.value,
  };
}

export function computeDiscountAmount(input: { type: 'fixed' | 'percent' | 'bogo'; value: number; purchaseAmount?: number | null }): { amountApplied: number; instruction?: string } {
  if (input.type === 'percent') {
    const base = input.purchaseAmount ?? 0;
    return { amountApplied: Math.max(0, Math.round(base * (input.value / 100) * 100) / 100) };
  }
  if (input.type === 'bogo') {
    return { amountApplied: input.purchaseAmount ? Math.min(input.value, input.purchaseAmount) : input.value, instruction: 'Buy one, get one applied manually at register' };
  }
  return { amountApplied: input.value };
}

export function toAppliedDiscount(input: { type: 'fixed' | 'percent' | 'bogo'; value: number; purchaseAmount?: number | null }): { type: 'fixed' | 'percent' | 'bogo'; value: number; description: string; instruction?: string } {
  const computed = computeDiscountAmount(input);
  const description = input.type === 'bogo' ? 'Buy one, get one offer' : input.type === 'percent' ? `${input.value}% off` : `$${input.value.toFixed(2)} off`;
  return { type: input.type, value: input.value, description, ...(computed.instruction ? { instruction: computed.instruction } : {}) };
}

export function buildLookupDiscountView(discount: DiscountRule, city?: string | null) {
  const normalized: NormalizedDiscount = {
    type: discount.type,
    value: normalizeNumber(discount.value),
    minPurchase: normalizeNumber(discount.min_purchase),
    cityOverrides: discount.city_overrides,
  };
  const adjusted = applyCityRules(normalized, city ?? null);
  const applied = toAppliedDiscount({ type: adjusted.type, value: adjusted.value });
  return {
    id: discount.id,
    cardId: discount.card_id,
    vendorId: discount.vendor_id,
    type: adjusted.type,
    value: adjusted.value,
    minPurchase: adjusted.minPurchase,
    maxUsesTotal: discount.max_uses_total,
    maxUsesPerCustomer: discount.max_uses_per_customer,
    usesCount: discount.uses_count,
    cityOverrides: discount.city_overrides,
    active: discount.active,
    applied,
  };
}
