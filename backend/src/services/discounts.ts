import type { AppliedDiscount, CityOverrideMap, DiscountType, LookupDiscountView } from '../types.js';

export interface DiscountLike {
  type: DiscountType;
  value: number | string;
  minPurchase?: number | string;
  cityOverrides?: CityOverrideMap | null;
}

export function normalizeNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function applyCityRules<T extends DiscountLike>(discount: T, city?: string | null): T {
  const normalizedCity = city?.trim().toLowerCase();
  const overrides = discount.cityOverrides ?? {};

  if (!normalizedCity) {
    return discount;
  }

  const match = Object.entries(overrides).find(([key]) => key.toLowerCase() === normalizedCity);
  if (!match) {
    return discount;
  }

  const [, override] = match;
  return {
    ...discount,
    type: override.type ?? discount.type,
    value: override.value ?? discount.value,
  };
}

export function computeDiscountAmount(input: {
  type: DiscountType;
  value: number;
  purchaseAmount?: number | null;
}): { amountApplied: number; instruction?: string } {
  const base = input.purchaseAmount ?? 0;

  if (input.type === 'bogo') {
    return {
      amountApplied: 0,
      instruction: 'BOGO offer: cashier applies the buy-one-get-one rule manually.',
    };
  }

  if (input.type === 'percent') {
    if (base <= 0) {
      return { amountApplied: 0, instruction: 'Purchase amount required for percent discounts.' };
    }

    return { amountApplied: Number(((base * input.value) / 100).toFixed(2)) };
  }

  return { amountApplied: Number(Math.max(0, input.value).toFixed(2)) };
}

export function toAppliedDiscount(input: {
  type: DiscountType;
  value: number;
  purchaseAmount?: number | null;
}): AppliedDiscount {
  const result = computeDiscountAmount(input);
  const applied: AppliedDiscount = {
    type: input.type,
    value: input.value,
    description:
      input.type === 'bogo'
        ? 'Buy one, get one offer'
        : input.type === 'percent'
          ? `${input.value}% off`
          : `$${input.value.toFixed(2)} off`,
  };
  if (result.instruction) {
    applied.instruction = result.instruction;
  }
  return applied;
}

export function buildLookupDiscountView<T extends DiscountLike & { id: string; cardId: string; vendorId: string; usesCount: number; maxUsesTotal: number | null; maxUsesPerCustomer: number | null; active: boolean }>(
  discount: T,
  city?: string | null,
): LookupDiscountView {
  const adjusted = applyCityRules(discount, city);
  const numericValue = normalizeNumber(adjusted.value);
  const numericMinPurchase = normalizeNumber(adjusted.minPurchase);
  const applied = toAppliedDiscount({
    type: adjusted.type,
    value: numericValue,
  });

  return {
    ...adjusted,
    value: numericValue,
    minPurchase: numericMinPurchase,
    cityOverrides: adjusted.cityOverrides ?? {},
    applied,
  };
}
