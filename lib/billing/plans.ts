import type { Plan } from '@/lib/db/schema';
import {
  PLAN_MONTHLY_CREDITS,
  PLAN_PRICE_FCFA,
  TOPUP_PACKS,
} from '@/lib/credits/pricing';

/**
 * Subscription plans, as billed.
 *
 * Prices and credit allowances live in lib/credits/pricing.ts — there is one
 * table of numbers in this codebase, not two. This module only adds what
 * billing needs on top: which plans are purchasable, cycle length, and how a
 * cycle is named.
 */

export const BILLING_CURRENCY = 'XOF';

/** Days in a billing cycle. */
export const CYCLE_LENGTH_DAYS = 30;

/** Failed attempts on one cycle before the tenant is suspended. */
export const MAX_PAYMENT_ATTEMPTS = 3;

/** Plans a tenant can subscribe to without talking to sales. */
export const PURCHASABLE_PLANS = ['starter', 'pro'] as const;
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export function isPurchasablePlan(plan: string): plan is PurchasablePlan {
  return (PURCHASABLE_PLANS as readonly string[]).includes(plan);
}

/** Price of a plan in whole XOF. Throws for plans that are quoted, not listed. */
export function planPriceXof(plan: Plan): number {
  const price = PLAN_PRICE_FCFA[plan];
  if (price === null) {
    throw new Error(`Plan "${plan}" is priced on quote and cannot be self-served.`);
  }
  return price;
}

export function planCredits(plan: Plan): number {
  return PLAN_MONTHLY_CREDITS[plan];
}

export function cycleEnd(from: Date): Date {
  return new Date(from.getTime() + CYCLE_LENGTH_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Deterministic invoice number. Derived from the tenant and cycle rather than
 * randomised, so retrying a checkout cannot mint a second number for the same
 * cycle — the unique index would reject it, which is the point.
 */
export function invoiceNumber(
  tenantId: number,
  cycleNumber: number,
  at: Date = new Date()
): string {
  return `SAAS-${at.getUTCFullYear()}-${String(tenantId).padStart(4, '0')}-${String(
    cycleNumber
  ).padStart(4, '0')}`;
}

export { TOPUP_PACKS };

/** A top-up pack by index, validated. */
export function topUpPack(index: number) {
  const pack = TOPUP_PACKS[index];
  if (!pack) {
    throw new Error(`Unknown top-up pack: ${index}`);
  }
  return pack;
}
