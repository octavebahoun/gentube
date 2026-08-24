import {
  PLAN_MONTHLY_CREDITS,
  PLAN_PRICE_FCFA,
  TOPUP_PACKS,
} from '@/lib/credits/pricing';

/**
 * The billing catalogue — written by hand, on purpose.
 *
 * There is no plans table and no admin screen to edit prices: an offer is a
 * constant in this file, reviewed and deployed like any other code change.
 * What a tenant is charged and how many credits it gets are the two numbers
 * that decide whether the product makes or loses money, so they belong in the
 * diff, not in a row someone can change at 2am.
 *
 * Prices and allowances themselves come from lib/credits/pricing.ts, which is
 * the single source of truth for the credit unit. This module only turns them
 * into things that can be bought.
 */

/** Plans a tenant can buy self-service. `business` is on quote (specs §1). */
export const PURCHASABLE_PLANS = ['starter', 'pro'] as const;
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export type PlanOffer = {
  plan: PurchasablePlan;
  name: string;
  /** Monthly price in whole XOF — the currency has no minor unit. */
  priceXof: number;
  /** Credits granted when a cycle is paid. */
  monthlyCredits: number;
};

export const PLAN_OFFERS: Record<PurchasablePlan, PlanOffer> = {
  starter: {
    plan: 'starter',
    name: 'Starter',
    priceXof: PLAN_PRICE_FCFA.starter as number,
    monthlyCredits: PLAN_MONTHLY_CREDITS.starter,
  },
  pro: {
    plan: 'pro',
    name: 'Pro',
    priceXof: PLAN_PRICE_FCFA.pro as number,
    monthlyCredits: PLAN_MONTHLY_CREDITS.pro,
  },
};

export type TopupPack = {
  id: string;
  priceXof: number;
  credits: number;
};

/**
 * One-off credit packs (specs §1). Bought credits never expire — unlike the
 * plan allowance, which belongs to its cycle.
 *
 * ⚠️ At the specified rate this pack is sold below provider cost; the margin is
 * asserted negative by lib/credits/pricing.test.ts so the problem cannot be
 * forgotten. Selling it is a pricing decision, not an implementation one — the
 * number lives in pricing.ts and nowhere else.
 */
export const TOPUP_PACKS_FOR_SALE: TopupPack[] = TOPUP_PACKS.map((pack) => ({
  id: `topup-${pack.priceFcfa}`,
  priceXof: pack.priceFcfa,
  credits: pack.credits,
}));

/** ISO code sent to the gateway. Mobile money in the zone is XOF only. */
export const CURRENCY = 'XOF';

/** A billing cycle is a flat 30 days: no proration, no mid-cycle maths. */
export const BILLING_CYCLE_DAYS = 30;

/**
 * Failed payments tolerated on one cycle before the subscription is suspended
 * (specs §3.A: "retry, puis passage du tenant en suspended").
 */
export const MAX_PAYMENT_ATTEMPTS = 3;

export class UnknownOfferError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'UnknownOfferError';
  }
}

export class InvalidAmountError extends Error {
  constructor(amount: unknown) {
    super(
      `Invalid XOF amount: ${JSON.stringify(amount)}. ` +
        'Amounts are whole XOF integers — the currency has no minor unit.'
    );
    this.name = 'InvalidAmountError';
  }
}

export function isPurchasablePlan(value: unknown): value is PurchasablePlan {
  return (
    typeof value === 'string' &&
    (PURCHASABLE_PLANS as readonly string[]).includes(value)
  );
}

/** Resolves a plan offer, refusing anything not sold self-service. */
export function getPlanOffer(plan: unknown): PlanOffer {
  if (!isPurchasablePlan(plan)) {
    throw new UnknownOfferError(
      `Plan ${JSON.stringify(plan)} cannot be bought online. ` +
        `Available: ${PURCHASABLE_PLANS.join(', ')} (business is on quote).`
    );
  }
  return PLAN_OFFERS[plan];
}

export function getTopupPack(id: unknown): TopupPack {
  const pack = TOPUP_PACKS_FOR_SALE.find((candidate) => candidate.id === id);
  if (!pack) {
    throw new UnknownOfferError(
      `Unknown top-up pack ${JSON.stringify(id)}. ` +
        `Available: ${TOPUP_PACKS_FOR_SALE.map((p) => p.id).join(', ')}.`
    );
  }
  return pack;
}

/**
 * Guards every amount on its way to or from the gateway. XOF has no decimals,
 * so a float here is always a bug — and a rounded one would be a silent
 * mispayment.
 */
export function assertXofAmount(amount: unknown): number {
  if (!Number.isInteger(amount) || (amount as number) <= 0) {
    throw new InvalidAmountError(amount);
  }
  return amount as number;
}

/** End of the cycle that starts at `from`. */
export function cyclePeriodEnd(from: Date): Date {
  return new Date(from.getTime() + BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000);
}
