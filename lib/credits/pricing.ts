import type { Plan, Resolution } from '@/lib/db/schema';

/**
 * Credit pricing — single source of truth.
 *
 * Unit (specs §1, non-negotiable): 1 credit = 1 second of generated video at
 * 480p. 720p costs 4 credits/second.
 */
export const CREDITS_PER_SECOND: Record<Resolution, number> = {
  '480p': 1,
  '720p': 4,
};

/** Replicate reference cost per second of *generated video* (specs §1). */
export const PROVIDER_COST_USD_PER_SECOND: Record<Resolution, number> = {
  '480p': 0.012,
  '720p': 0.046,
};

export const FCFA_PER_USD = 625;

/**
 * ⚠️ The "Crédits" column of the specs §1 table is inconsistent with the credit
 * unit defined in the same section. Reading it literally:
 *
 *   Starter = 10 000 credits = 10 000 s at 480p = 166 min,
 *   but the same row claims ~23 min, and 10 000 s costs $120 of Replicate
 *   for a 15 000 FCFA (~$24) plan.
 *
 * The numbers reconcile if that cell is the FCFA *compute budget* (plan price
 * minus platform share), not a credit count:
 *
 *   Starter: 15 000 − 5 000 = 10 000 FCFA ≈ $16 → $16 / $0.012 = 1 333 s ≈ 22 min ✓
 *   Pro:     30 000 − 8 000 = 22 000 FCFA ≈ $35 → $35 / $0.012 = 2 933 s ≈ 49 min ✓
 *
 * Both match the "~480p" column of the same table, so the allowances below are
 * derived that way. Change these two numbers if the intent was different — it
 * is the only place they appear.
 */
export const PLAN_MONTHLY_CREDITS: Record<Plan, number> = {
  starter: 1_333,
  pro: 3_000,
  business: 0, // negotiated per contract
};

export const PLAN_PRICE_FCFA: Record<Plan, number | null> = {
  starter: 15_000,
  pro: 30_000,
  business: null, // on quote
};

/**
 * Top-up packs (specs §1). Value kept as specified.
 *
 * ⚠️ At the specified unit this pack sells 3 000 s of 480p (≈ $36 of Replicate)
 * for 5 000 FCFA (≈ $8) — a ~$28 loss per pack. Break-even at the Starter
 * plan's compute share (~2/3) would be ≈ 450 credits. Use `topUpMarginFcfa()`
 * to check before shipping payments.
 */
export const TOPUP_PACKS: { priceFcfa: number; credits: number }[] = [
  { priceFcfa: 5_000, credits: 3_000 },
];

function assertPositiveDuration(durationS: number): void {
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new RangeError(`Invalid shot duration: ${durationS}s (must be > 0).`);
  }
}

/** Credits required to generate one shot. Always rounded up. */
export function creditsForShot(
  durationS: number,
  resolution: Resolution
): number {
  assertPositiveDuration(durationS);
  return Math.ceil(durationS * CREDITS_PER_SECOND[resolution]);
}

/**
 * Credits required for a whole storyboard. Rounded up per shot, because a shot
 * is the unit actually sent to the provider.
 */
export function estimateVideoCredits(
  shots: { durationS: number }[],
  resolution: Resolution
): number {
  return shots.reduce(
    (total, shot) => total + creditsForShot(shot.durationS, resolution),
    0
  );
}

/** What those credits are expected to cost us at the provider, in USD. */
export function providerCostUsd(
  credits: number,
  resolution: Resolution
): number {
  const seconds = credits / CREDITS_PER_SECOND[resolution];
  return seconds * PROVIDER_COST_USD_PER_SECOND[resolution];
}

/** Seconds of video a balance buys at a given resolution. */
export function secondsAffordable(
  credits: number,
  resolution: Resolution
): number {
  return Math.floor(credits / CREDITS_PER_SECOND[resolution]);
}

/** Gross margin of a top-up pack, in FCFA, at 480p provider cost. */
export function topUpMarginFcfa(pack: {
  priceFcfa: number;
  credits: number;
}): number {
  const costFcfa = providerCostUsd(pack.credits, '480p') * FCFA_PER_USD;
  return Math.round(pack.priceFcfa - costFcfa);
}
