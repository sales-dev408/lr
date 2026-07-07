import type { RedeemResult } from '../types.js';
import { withDbClient, type PoolClient } from '../db/pool.js';
import { applyCityRules, computeDiscountAmount, normalizeNumber, toAppliedDiscount } from './discounts.js';

export interface RedeemInput {
  lookupToken?: string;
  cardId?: string;
  userId?: string;
  vendorId: string;
  discountId?: string;
  city?: string | null;
  purchaseAmount?: number | null;
  giftCardId?: string;
  actorType?: 'admin' | 'vendor' | 'customer' | 'system';
  actorId?: string | null;
  ip?: string | null;
}

function asNumeric(value: unknown): number {
  return normalizeNumber(typeof value === 'number' || typeof value === 'string' ? value : 0);
}

export async function redeemDiscount(input: RedeemInput): Promise<RedeemResult> {
  return withDbClient(async (client) => {
    await client.query('BEGIN');

    try {
      const lookupRow = input.lookupToken
        ? await client.query<{
            pass_id: string;
            user_id: string;
            card_id: string;
          }>(
            `
              SELECT p.id AS pass_id, p.user_id, p.card_id
              FROM passes p
              WHERE p.lookup_token = $1
              LIMIT 1
            `,
            [input.lookupToken],
          )
        : { rows: [] };

      const userId = input.userId ?? lookupRow.rows[0]?.user_id ?? null;
      const cardId = input.cardId ?? lookupRow.rows[0]?.card_id ?? null;
      const passId = lookupRow.rows[0]?.pass_id ?? null;

      if (!cardId) {
        throw new Error('cardId or lookupToken is required');
      }

      const cardRows = await client.query<{
        id: string;
        name: string;
        status: string;
        expiration_date: string | null;
        max_uses: number | null;
      }>('SELECT id, name, status, expiration_date, max_uses FROM cards WHERE id = $1 LIMIT 1', [cardId]);

      const card = cardRows.rows[0];
      if (!card) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Card not found' });
      }

      if (card.status !== 'active') {
        return await denyAndCommit(client, input, { valid: false, reason: 'Card is not active' }, userId, cardId, passId);
      }

      if (card.expiration_date && new Date(card.expiration_date).getTime() < Date.now()) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Card has expired' }, userId, cardId, passId);
      }

      const vendorParticipation = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM card_vendors WHERE card_id = $1 AND vendor_id = $2) AS exists',
        [cardId, input.vendorId],
      );
      if (!vendorParticipation.rows[0]?.exists) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Vendor is not linked to this card' }, userId, cardId, passId);
      }

      const discountRows = await client.query<{
        id: string;
        card_id: string;
        vendor_id: string;
        type: 'fixed' | 'percent' | 'bogo';
        value: string;
        min_purchase: string;
        max_uses_total: number | null;
        max_uses_per_customer: number | null;
        uses_count: number;
        city_overrides: Record<string, { type?: 'fixed' | 'percent' | 'bogo'; value?: number }> | null;
        active: boolean;
      }>(
        `
          SELECT *
          FROM discounts
          WHERE card_id = $1
            AND vendor_id = $2
            ${input.discountId ? 'AND id = $3' : ''}
          FOR UPDATE
        `,
        input.discountId ? [cardId, input.vendorId, input.discountId] : [cardId, input.vendorId],
      );

      const discount = discountRows.rows[0];
      if (!discount) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Discount not found' }, userId, cardId, passId);
      }

      const adjustedDiscount = applyCityRules(
        {
          type: discount.type,
          value: asNumeric(discount.value),
          minPurchase: asNumeric(discount.min_purchase),
          cityOverrides: discount.city_overrides,
        },
        input.city ?? null,
      );

      if (!discount.active) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Discount is inactive' }, userId, cardId, passId);
      }

      if (discount.max_uses_total !== null && discount.uses_count >= discount.max_uses_total) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Discount limit reached' }, userId, cardId, passId);
      }

      if (discount.max_uses_per_customer !== null && userId) {
        const perCustomer = await client.query<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM redemptions WHERE discount_id = $1 AND user_id = $2 AND status = \'approved\'',
          [discount.id, userId],
        );
        if (Number(perCustomer.rows[0]?.count ?? '0') >= discount.max_uses_per_customer) {
          return await denyAndCommit(client, input, { valid: false, reason: 'Customer limit reached' }, userId, cardId, passId);
        }
      }

      const cardUsage = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM redemptions WHERE card_id = $1 AND status = \'approved\'',
        [cardId],
      );
      if (card.max_uses !== null && Number(cardUsage.rows[0]?.count ?? '0') >= card.max_uses) {
        return await denyAndCommit(client, input, { valid: false, reason: 'Card usage limit reached' }, userId, cardId, passId);
      }

      const amountInput: {
        type: typeof adjustedDiscount.type;
        value: number;
        purchaseAmount?: number | null;
      } = {
        type: adjustedDiscount.type,
        value: adjustedDiscount.value,
      };
      if (input.purchaseAmount !== undefined && input.purchaseAmount !== null) {
        amountInput.purchaseAmount = input.purchaseAmount;
      }
      const computed = computeDiscountAmount(amountInput);
      const applied = toAppliedDiscount(amountInput);
      const redemption = await client.query<{ id: string }>(
        `
          INSERT INTO redemptions (
            discount_id, gift_card_id, card_id, vendor_id, user_id, pass_id, amount_applied, city, status, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', NULL)
          RETURNING id
        `,
        [
          discount.id,
          input.giftCardId ?? null,
          cardId,
          input.vendorId,
          userId,
          passId,
          computed.amountApplied,
          input.city ?? null,
        ],
      );

      await client.query('UPDATE discounts SET uses_count = uses_count + 1, updated_at = now() WHERE id = $1', [discount.id]);

      if (input.giftCardId) {
        await client.query('UPDATE gift_cards SET balance = GREATEST(balance - $1, 0), updated_at = now() WHERE id = $2', [
          computed.amountApplied,
          input.giftCardId,
        ]);
      }

      await client.query(
        `
          INSERT INTO transactions (actor_type, actor_id, action, entity_type, entity_id, metadata, ip)
          VALUES ($1, $2, $3, 'redemption', $4, $5::jsonb, $6)
        `,
        [
          input.actorType ?? 'system',
          input.actorId ?? null,
          'redeem.approved',
          redemption.rows[0]!.id,
          JSON.stringify({
            discountId: discount.id,
            cardId,
            vendorId: input.vendorId,
            amountApplied: computed.amountApplied,
            city: input.city ?? null,
          }),
          input.ip ?? null,
        ],
      );

      await client.query('COMMIT');
      const success: RedeemResult = {
        valid: true,
        discount: applied,
        amountApplied: computed.amountApplied,
        redemptionId: redemption.rows[0]!.id,
      };
      if (computed.instruction) {
        success.instruction = computed.instruction;
      }
      return success;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function denyAndCommit(
  client: PoolClient,
  input: RedeemInput,
  result: RedeemResult,
  userId?: string | null,
  cardId?: string | null,
  passId?: string | null,
): Promise<RedeemResult> {
  if (!cardId) {
    await client.query('COMMIT');
    return result;
  }

  const denied = await client.query<{ id: string }>(
    `
      INSERT INTO redemptions (
        discount_id, gift_card_id, card_id, vendor_id, user_id, pass_id, amount_applied, city, status, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'denied', $8)
      RETURNING id
    `,
    [
      input.discountId ?? null,
      input.giftCardId ?? null,
      cardId,
      input.vendorId,
      userId ?? null,
      passId ?? null,
      input.city ?? null,
      result.reason ?? 'Denied',
    ],
  );

  await client.query(
    `
      INSERT INTO transactions (actor_type, actor_id, action, entity_type, entity_id, metadata, ip)
      VALUES ($1, $2, $3, 'redemption', $4, $5::jsonb, $6)
    `,
    [
      input.actorType ?? 'system',
      input.actorId ?? null,
      'redeem.denied',
      denied.rows[0]!.id,
      JSON.stringify({
        reason: result.reason,
        discountId: input.discountId ?? null,
        cardId,
        vendorId: input.vendorId,
      }),
      input.ip ?? null,
    ],
  );

  await client.query('COMMIT');
  return result;
}
