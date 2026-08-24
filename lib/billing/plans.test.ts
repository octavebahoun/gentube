import { describe, expect, it } from 'vitest';
import {
  PLAN_MONTHLY_CREDITS,
  PLAN_PRICE_FCFA,
  TOPUP_PACKS,
} from '@/lib/credits/pricing';
import {
  BILLING_CYCLE_DAYS,
  CURRENCY,
  InvalidAmountError,
  MAX_PAYMENT_ATTEMPTS,
  PLAN_OFFERS,
  PURCHASABLE_PLANS,
  TOPUP_PACKS_FOR_SALE,
  UnknownOfferError,
  assertXofAmount,
  cyclePeriodEnd,
  getPlanOffer,
  getTopupPack,
} from './plans';

describe('billing catalogue', () => {
  it('sells exactly the plans the specs put a price on', () => {
    expect([...PURCHASABLE_PLANS]).toEqual(['starter', 'pro']);
  });

  it('charges the price and grants the allowance defined in pricing.ts', () => {
    // The catalogue must never restate a number: a drift here would mean two
    // sources of truth for what a plan costs.
    expect(PLAN_OFFERS.starter.priceXof).toBe(PLAN_PRICE_FCFA.starter);
    expect(PLAN_OFFERS.pro.priceXof).toBe(PLAN_PRICE_FCFA.pro);
    expect(PLAN_OFFERS.starter.monthlyCredits).toBe(
      PLAN_MONTHLY_CREDITS.starter
    );
    expect(PLAN_OFFERS.pro.monthlyCredits).toBe(PLAN_MONTHLY_CREDITS.pro);
  });

  it('prices every offer in whole XOF', () => {
    expect(CURRENCY).toBe('XOF');
    for (const offer of Object.values(PLAN_OFFERS)) {
      expect(Number.isInteger(offer.priceXof)).toBe(true);
      expect(assertXofAmount(offer.priceXof)).toBe(offer.priceXof);
    }
    for (const pack of TOPUP_PACKS_FOR_SALE) {
      expect(assertXofAmount(pack.priceXof)).toBe(pack.priceXof);
    }
  });

  it('refuses a plan that is not sold self-service', () => {
    // Business is on quote (specs §1): no checkout may open for it.
    expect(() => getPlanOffer('business')).toThrow(UnknownOfferError);
    expect(() => getPlanOffer('enterprise')).toThrow(UnknownOfferError);
    expect(() => getPlanOffer(undefined)).toThrow(UnknownOfferError);
    expect(() => getPlanOffer({ plan: 'pro' })).toThrow(UnknownOfferError);
  });

  it('exposes the specs top-up pack, resolvable by id', () => {
    expect(TOPUP_PACKS_FOR_SALE).toHaveLength(TOPUP_PACKS.length);
    const pack = TOPUP_PACKS_FOR_SALE[0];
    expect(pack.priceXof).toBe(TOPUP_PACKS[0].priceFcfa);
    expect(pack.credits).toBe(TOPUP_PACKS[0].credits);
    expect(getTopupPack(pack.id)).toEqual(pack);
    expect(() => getTopupPack('topup-999')).toThrow(UnknownOfferError);
  });

  it('rejects any amount that is not a positive integer', () => {
    // XOF has no minor unit: a decimal amount is a bug, never a rounding.
    expect(() => assertXofAmount(15_000.5)).toThrow(InvalidAmountError);
    expect(() => assertXofAmount(0)).toThrow(InvalidAmountError);
    expect(() => assertXofAmount(-15_000)).toThrow(InvalidAmountError);
    expect(() => assertXofAmount('15000')).toThrow(InvalidAmountError);
    expect(() => assertXofAmount(Number.NaN)).toThrow(InvalidAmountError);
  });

  it('runs a cycle for a flat 30 days', () => {
    const start = new Date('2026-01-15T10:00:00.000Z');
    expect(BILLING_CYCLE_DAYS).toBe(30);
    expect(cyclePeriodEnd(start).toISOString()).toBe(
      '2026-02-14T10:00:00.000Z'
    );
  });

  it('tolerates a bounded number of failed attempts before suspending', () => {
    expect(MAX_PAYMENT_ATTEMPTS).toBeGreaterThan(1);
  });
});
