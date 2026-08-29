import { and, eq, gte, sql } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import {
  creditLedger,
  creditReasonEnum,
  shots,
  tenants,
  videos,
  type CreditLedgerEntry,
  type Video,
} from '@/lib/db/schema';
import { estimateVideoCredits } from './pricing';

export class InsufficientCreditsError extends Error {
  constructor(
    readonly required: number,
    readonly available: number
  ) {
    super(
      `Insufficient credits: ${required} required, ${available} available.`
    );
    this.name = 'InsufficientCreditsError';
  }
}

export class InvalidCreditAmountError extends Error {
  constructor(amount: number) {
    super(`Invalid credit amount: ${amount}. Must be a positive integer.`);
    this.name = 'InvalidCreditAmountError';
  }
}

export type CreditReason = (typeof creditReasonEnum.enumValues)[number];

export type LedgerResult = {
  entry: CreditLedgerEntry;
  balance: number;
  /** True when an idempotency key matched an existing entry and nothing moved. */
  replayed: boolean;
};

type MovementInput = {
  amount: number;
  reason: CreditReason;
  videoId?: number;
  /** Set this on webhook-driven writes so a replay is a no-op. */
  idempotencyKey?: string;
  /**
   * Whether these credits belong to the expiring plan quota. Defaults to what
   * the reason implies — a plan allowance expires at the end of the cycle,
   * anything bought or refunded does not (specs §1).
   */
  expiring?: boolean;
};

/** Reasons whose credits die with the billing cycle. */
const EXPIRING_REASONS: ReadonlySet<CreditReason> = new Set([
  'signup_grant',
  'subscription_grant',
]);

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidCreditAmountError(amount);
  }
}

async function findReplay(
  tdb: TenantDb,
  idempotencyKey?: string
): Promise<CreditLedgerEntry | null> {
  if (!idempotencyKey) return null;
  return await tdb.findFirst(
    creditLedger,
    eq(creditLedger.idempotencyKey, idempotencyKey)
  );
}

/** Current credit balance of the tenant. */
export async function getBalance(tdb: TenantDb): Promise<number> {
  const tenant = await tdb.getTenant();
  if (!tenant) throw new Error(`Tenant ${tdb.tenantId} not found.`);
  return tenant.creditsBalance;
}

/** Total balance split into the expiring plan quota and purchased credits. */
export async function getBalances(tdb: TenantDb): Promise<{
  total: number;
  plan: number;
  purchased: number;
}> {
  const tenant = await tdb.getTenant();
  if (!tenant) throw new Error(`Tenant ${tdb.tenantId} not found.`);
  return {
    total: tenant.creditsBalance,
    plan: tenant.planCreditsBalance,
    purchased: tenant.creditsBalance - tenant.planCreditsBalance,
  };
}

export async function canAfford(
  tdb: TenantDb,
  amount: number
): Promise<boolean> {
  return (await getBalance(tdb)) >= amount;
}

/**
 * Adds credits (plan grant, top-up, refund). The tenant row and the ledger
 * entry move together in one transaction.
 */
export async function grantCredits(
  tdb: TenantDb,
  {
    amount,
    reason,
    videoId,
    idempotencyKey,
    expiring,
    planPortion,
  }: MovementInput & {
    /** Forces how much lands in the plan bucket — used by refunds. */
    planPortion?: number;
  }
): Promise<LedgerResult> {
  assertAmount(amount);
  const intoPlanBucket = expiring ?? EXPIRING_REASONS.has(reason);

  return await tdb.transaction(async (tx) => {
    const replay = await findReplay(tx, idempotencyKey);
    if (replay) {
      return { entry: replay, balance: await getBalance(tx), replayed: true };
    }

    const planDelta =
      planPortion !== undefined
        ? Math.min(Math.max(planPortion, 0), amount)
        : intoPlanBucket
          ? amount
          : 0;

    const [tenant] = await tx.updateTenant({
      creditsBalance: sql`${tenants.creditsBalance} + ${amount}`,
      planCreditsBalance: sql`${tenants.planCreditsBalance} + ${planDelta}`,
      updatedAt: new Date(),
    });
    if (!tenant) throw new Error(`Tenant ${tx.tenantId} not found.`);

    const [entry] = await tx.insert(creditLedger, {
      delta: amount,
      planDelta,
      reason,
      videoId: videoId ?? null,
      balanceAfter: tenant.creditsBalance,
      idempotencyKey: idempotencyKey ?? null,
    });

    return { entry, balance: tenant.creditsBalance, replayed: false };
  });
}

/**
 * Removes credits. Blocks at zero: the balance is decremented by a conditional
 * `UPDATE ... WHERE credits_balance >= amount`, so concurrent debits serialise
 * on the tenant row and the balance can never go negative. When the guard
 * fails, nothing is written and `InsufficientCreditsError` is thrown.
 */
export async function debitCredits(
  tdb: TenantDb,
  { amount, reason, videoId, idempotencyKey, planPortion }: MovementInput & {
    /** Forces how much comes out of the plan bucket — used by refunds. */
    planPortion?: number;
  }
): Promise<LedgerResult> {
  assertAmount(amount);

  return await tdb.transaction(async (tx) => {
    const replay = await findReplay(tx, idempotencyKey);
    if (replay) {
      return { entry: replay, balance: await getBalance(tx), replayed: true };
    }

    // Locks the tenant row for the rest of the transaction, so the balance
    // read below cannot go stale before the update lands. Concurrent debits
    // queue here rather than racing.
    const before = await tx.getTenantForUpdate();
    if (!before) throw new Error(`Tenant ${tx.tenantId} not found.`);
    if (before.creditsBalance < amount) {
      throw new InsufficientCreditsError(amount, before.creditsBalance);
    }

    // The expiring quota is spent before purchased credits, so a tenant never
    // loses credits it paid for while plan credits sat unused.
    const fromPlan =
      planPortion !== undefined
        ? Math.min(planPortion, before.planCreditsBalance)
        : Math.min(amount, before.planCreditsBalance);

    // The `>= amount` guard is redundant under the lock above and kept anyway:
    // it is the constraint that makes a negative balance impossible even if a
    // future caller reaches this without a transaction.
    const [tenant] = await tx.updateTenant(
      {
        creditsBalance: sql`${tenants.creditsBalance} - ${amount}`,
        planCreditsBalance: sql`${tenants.planCreditsBalance} - ${fromPlan}`,
        updatedAt: new Date(),
      },
      gte(tenants.creditsBalance, amount)
    );

    if (!tenant) {
      throw new InsufficientCreditsError(amount, await getBalance(tx));
    }

    const [entry] = await tx.insert(creditLedger, {
      delta: -amount,
      planDelta: -fromPlan,
      reason,
      videoId: videoId ?? null,
      balanceAfter: tenant.creditsBalance,
      idempotencyKey: idempotencyKey ?? null,
    });

    return { entry, balance: tenant.creditsBalance, replayed: false };
  });
}

/**
 * Drops whatever is left of the plan allowance. Called when a billing cycle
 * rolls over: the quota expires, purchased credits survive (specs §1).
 */
export async function expirePlanCredits(
  tdb: TenantDb
): Promise<{ expired: number; balance: number }> {
  return await tdb.transaction(async (tx) => {
    const before = await tx.getTenantForUpdate();
    if (!before) throw new Error(`Tenant ${tx.tenantId} not found.`);

    const expired = before.planCreditsBalance;
    if (expired === 0) {
      return { expired: 0, balance: before.creditsBalance };
    }

    const [tenant] = await tx.updateTenant({
      creditsBalance: sql`${tenants.creditsBalance} - ${expired}`,
      planCreditsBalance: 0,
      updatedAt: new Date(),
    });

    await tx.insert(creditLedger, {
      delta: -expired,
      planDelta: -expired,
      reason: 'plan_quota_expired',
      balanceAfter: tenant.creditsBalance,
    });

    return { expired, balance: tenant.creditsBalance };
  });
}

/**
 * Estimates a video from its storyboard and stores the estimate. Read-only on
 * the balance — nothing is charged here (specs §4: debit happens at
 * validation, never before).
 */
export async function estimateVideo(
  tdb: TenantDb,
  videoId: number
): Promise<{ video: Video; creditsEstimated: number; balance: number }> {
  const video = await tdb.findById(videos, videoId);
  if (!video) throw new Error(`Video ${videoId} not found for this tenant.`);

  const storyboard = await tdb.findMany(shots, eq(shots.videoId, videoId));
  const creditsEstimated = estimateVideoCredits(storyboard, video.resolution);

  const [updated] = await tdb.update(
    videos,
    { creditsEstimated, updatedAt: new Date() },
    eq(videos.id, videoId)
  );

  return { video: updated, creditsEstimated, balance: await getBalance(tdb) };
}

/**
 * Validates a storyboard and charges it. This is the single point where a
 * video leaves `draft`, and the only place video credits are debited.
 *
 * Charge and status change share one transaction, so a failed debit leaves the
 * video in `draft` and no ledger row behind.
 */
export async function validateAndChargeVideo(
  tdb: TenantDb,
  videoId: number
): Promise<{ video: Video; charged: number; balance: number }> {
  return await tdb.transaction(async (tx) => {
    const video = await tx.findById(videos, videoId);
    if (!video) throw new Error(`Video ${videoId} not found for this tenant.`);
    if (video.status !== 'draft') {
      throw new Error(
        `Video ${videoId} is ${video.status}; only a draft can be validated.`
      );
    }

    const storyboard = await tx.findMany(shots, eq(shots.videoId, videoId));
    if (storyboard.length === 0) {
      throw new Error(`Video ${videoId} has no shots to generate.`);
    }

    const charged = estimateVideoCredits(storyboard, video.resolution);

    const { balance } = await debitCredits(tx, {
      amount: charged,
      reason: 'video_debit',
      videoId,
      idempotencyKey: `video:${videoId}:debit`,
    });

    const [updated] = await tx.update(
      videos,
      {
        status: 'validated',
        creditsEstimated: charged,
        creditsConsumed: charged,
        updatedAt: new Date(),
      },
      eq(videos.id, videoId)
    );

    return { video: updated, charged, balance };
  });
}

/**
 * Gives back what a failed video consumed. Refunds at most what was actually
 * charged, and marks the video `failed`.
 */
export async function refundVideo(
  tdb: TenantDb,
  videoId: number
): Promise<{ video: Video; refunded: number; balance: number }> {
  return await tdb.transaction(async (tx) => {
    const video = await tx.findById(videos, videoId);
    if (!video) throw new Error(`Video ${videoId} not found for this tenant.`);

    const refunded = video.creditsConsumed;
    let balance = await getBalance(tx);

    if (refunded > 0) {
      // Credits go back to the bucket they were taken from. Without this, a
      // charge paid out of the expiring plan quota would come back as a
      // credit that never expires.
      const debit = await tx.findFirst(
        creditLedger,
        eq(creditLedger.idempotencyKey, `video:${videoId}:debit`)
      );

      ({ balance } = await grantCredits(tx, {
        amount: refunded,
        reason: 'video_refund',
        videoId,
        idempotencyKey: `video:${videoId}:refund`,
        planPortion: debit ? Math.min(-debit.planDelta, refunded) : 0,
      }));
    }

    const [updated] = await tx.update(
      videos,
      { status: 'failed', creditsConsumed: 0, updatedAt: new Date() },
      eq(videos.id, videoId)
    );

    return { video: updated, refunded, balance };
  });
}

/** Ledger history, most recent first. */
export async function listLedger(
  tdb: TenantDb,
  limit = 50
): Promise<CreditLedgerEntry[]> {
  return await tdb.findMany(creditLedger, undefined, {
    orderBy: [sql`${creditLedger.createdAt} desc`, sql`${creditLedger.id} desc`],
    limit,
  });
}

/** Sum of every ledger delta — must always equal `tenants.credits_balance`. */
export async function ledgerSum(tdb: TenantDb): Promise<number> {
  const rows = await tdb.findMany(creditLedger);
  return rows.reduce((total, row) => total + row.delta, 0);
}

export { and, eq };
