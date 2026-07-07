import { describe, expect, it } from 'vitest';
import { applyCityRules, computeDiscountAmount, buildLookupDiscountView } from './discounts.js';

describe('discount helpers', () => {
  it('applies city override values', () => {
    const discount = applyCityRules(
      { type: 'fixed', value: 5, minPurchase: 0, cityOverrides: { phoenix: { type: 'percent', value: 12 } } },
      'Phoenix',
    );

    expect(discount.type).toBe('percent');
    expect(discount.value).toBe(12);
  });

  it('computes percent discount amount', () => {
    expect(computeDiscountAmount({ type: 'percent', value: 10, purchaseAmount: 50 })).toEqual({ amountApplied: 5 });
  });

  it('returns bogo instruction', () => {
    expect(computeDiscountAmount({ type: 'bogo', value: 0 })).toMatchObject({
      amountApplied: 0,
      instruction: expect.stringContaining('BOGO'),
    });
  });

  it('builds lookup view with numeric fields', () => {
    const view = buildLookupDiscountView(
      {
        id: '1',
        cardId: '2',
        vendorId: '3',
        type: 'fixed',
        value: '9.5',
        minPurchase: '20',
        maxUsesTotal: null,
        maxUsesPerCustomer: null,
        usesCount: 0,
        cityOverrides: {},
        active: true,
      },
      'Mesa',
    );

    expect(view.value).toBe(9.5);
    expect(view.minPurchase).toBe(20);
    expect(view.applied.description).toContain('$9.50');
  });
});
