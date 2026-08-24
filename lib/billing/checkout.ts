import { and, desc, eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import {
  billingCycles,
  creditLedger,
  paymentAttempts,
  paymentIntents,
  subscriptions,
  type BillingCycle,
  type PaymentIntent,
  type Subscription,
} from '@/lib/db/schema';
import { getBalance } from '@/lib/credits';
import {
  GeniusPayClient,
  createGeniusPayClient,
  type CreatedPayment,
} from '@/lib/payments/geniuspay';
import { appBaseUrl, isBillingConfigured } from './config';
import {
  MAX_PAYMENT_ATTEMPTS,
  PLAN_OFFERS,
  TOPUP_PACKS_FOR_SALE,
  assertXofAmount,
  cyclePeriodEnd,
  getPlanOffer,
  getTopupPack,
  type PlanOffer,
  type TopupPack,
} from './plans';

/**
 * Checkout — the paying half of billing.
 *
 * Nothing here grants a single credit. A checkout only creates the local rows
 * the gateway's confirmation will later be matched against, and hands back a
 * URL. Credits move in lib/billing/webhook.ts, after the payment has been
 * re-read from the gateway.
 */

export class BillingError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'BillingError';
    this.statusCode = statusCode;
  }
}

export type CheckoutResult = {
  checkoutUrl: string;
  intentId: number;
  amountXof: number;
  gatewayReference: string;
  cycleId?: number;
  attemptId?: number;
};

type CheckoutOptions = {
  /** Injectable for tests; production builds one from the environment. */
  client?: GeniusPayClient;
  baseUrl?: string;
};

/** Only an owner or an admin may change what the workspace is billed. */
export function assertCanManageBilling(user: { role: string }): void {
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw new BillingError(
      'Only an owner or admin can manage billing.',
      403
    );
  }
}

function resolveClient(options: CheckoutOptions): GeniusPayClient {
  return options.client ?? createGeniusPayClient();
}

function returnUrls(baseUrl: string, intentId: number) {
  return {
    successUrl: `${baseUrl}/dashboard/billing?payment=success&intent=${intentId}`,
    errorUrl: `${baseUrl}/dashboard/billing?payment=failed&intent=${intentId}`,
  };
}

/** The tenant's subscription row, created on first checkout. */
export async function getSubscription(
  tdb: TenantDb
): Promise<Subscription | null> {
  return await tdb.findFirst(subscriptions);
}

async function getOrCreateSubscription(
  tdb: TenantDb,
  plan: PlanOffer
): Promise<Subscription> {
  const existing = await getSubscription(tdb);
  if (existing) return existing;

  // Created `pending`: the plan on the row is what is being bought, and only
  // the confirmed payment turns it into the tenant's actual plan.
  const [created] = await tdb.insert(subscriptions, {
    plan: plan.plan,
    status: 'pending',
  });
  return created;
}

/**
 * The cycle a new attempt belongs to.
 *
 * An unpaid cycle for the same plan is reused, so three tries at the same
 * month's bill are three `payment_attempts` on one cycle rather than three
 * cycles — which is what makes "retry, then suspend" (specs §3.A) countable.
 * Once a cycle has burned its retries, the next checkout opens a fresh one, so
 * a suspended tenant can always pay its way back.
 */
async function resolveCycle(
  tdb: TenantDb,
  subscription: Subscription,
  offer: PlanOffer
): Promise<BillingCycle> {
  const open = await tdb.findFirst(
    billingCycles,
    and(
      eq(billingCycles.subscriptionId, subscription.id),
      eq(billingCycles.status, 'pending'),
      eq(billingCycles.plan, offer.plan)
    ),
    { orderBy: [desc(billingCycles.id)] }
  );

  if (open) {
    const failed = await tdb.count(
      paymentAttempts,
      and(
        eq(paymentAttempts.billingCycleId, open.id),
        eq(paymentAttempts.status, 'failed')
      )
    );
    if (failed < MAX_PAYMENT_ATTEMPTS) return open;
  }

  const periodStart = new Date();
  const [cycle] = await tdb.insert(billingCycles, {
    subscriptionId: subscription.id,
    plan: offer.plan,
    periodStart,
    periodEnd: cyclePeriodEnd(periodStart),
    amountXof: offer.priceXof,
    creditsGranted: offer.monthlyCredits,
    status: 'pending',
  });
  return cycle;
}

/**
 * Records what the gateway answered, or closes the rows it never accepted.
 *
 * The local rows are written *before* the call because their ids travel in the
 * gateway metadata; a failed call must therefore mark them failed rather than
 * leave a "pending" payment that nothing is waiting for.
 */
async function attachGatewayResult(
  tdb: TenantDb,
  intent: PaymentIntent,
  attemptId: number | undefined,
  created: CreatedPayment
): Promise<void> {
  await tdb.update(
    paymentIntents,
    {
      gatewayReference: created.reference,
      checkoutUrl: created.checkoutUrl,
      status: 'pending',
      gatewayStatus: created.payment.status ?? null,
      updatedAt: new Date(),
    },
    eq(paymentIntents.id, intent.id)
  );

  if (attemptId !== undefined) {
    await tdb.update(
      paymentAttempts,
      { gatewayReference: created.reference, updatedAt: new Date() },
      eq(paymentAttempts.id, attemptId)
    );
  }
}

async function markCheckoutFailed(
  tdb: TenantDb,
  intentId: number,
  attemptId: number | undefined,
  reason: string
): Promise<void> {
  await tdb.update(
    paymentIntents,
    {
      status: 'failed',
      failureReason: reason,
      failedAt: new Date(),
      updatedAt: new Date(),
    },
    eq(paymentIntents.id, intentId)
  );

  if (attemptId !== undefined) {
    await tdb.update(
      paymentAttempts,
      { status: 'failed', error: reason, updatedAt: new Date() },
      eq(paymentAttempts.id, attemptId)
    );
  }
  // The cycle stays `pending`: the period is still unpaid and reusable. Only
  // exhausted retries close it (see lib/billing/webhook.ts).
}

/**
 * Opens a checkout for a monthly plan. The tenant's plan does not change here —
 * it changes when the payment is confirmed.
 */
export async function createSubscriptionCheckout(
  tdb: TenantDb,
  plan: unknown,
  options: CheckoutOptions = {}
): Promise<CheckoutResult> {
  const offer = getPlanOffer(plan);
  // Configuration is checked before the first write, so a misconfigured
  // instance answers "not configured" instead of leaving orphan rows behind.
  const client = resolveClient(options);
  const baseUrl = options.baseUrl ?? appBaseUrl();

  const subscription = await getOrCreateSubscription(tdb, offer);
  const cycle = await resolveCycle(tdb, subscription, offer);

  const attemptNumber =
    (await tdb.count(
      paymentAttempts,
      eq(paymentAttempts.billingCycleId, cycle.id)
    )) + 1;

  const [intent] = await tdb.insert(paymentIntents, {
    kind: 'subscription',
    plan: offer.plan,
    billingCycleId: cycle.id,
    amountXof: assertXofAmount(offer.priceXof),
    creditsGranted: offer.monthlyCredits,
    status: 'created',
    metadata: { plan: offer.plan, cycle_id: cycle.id },
  });

  const [attempt] = await tdb.insert(paymentAttempts, {
    billingCycleId: cycle.id,
    paymentIntentId: intent.id,
    attemptNumber,
    status: 'pending',
  });

  const { successUrl, errorUrl } = returnUrls(baseUrl, intent.id);

  let created: CreatedPayment;
  try {
    created = await client.createPayment({
      amountXof: offer.priceXof,
      description: `GenTube — abonnement ${offer.name} (30 jours)`,
      successUrl,
      errorUrl,
      // Informational only. The webhook resolves the tenant from the gateway
      // reference it finds in our own payment_intents row, never from this —
      // metadata is attacker-supplied on the way back in.
      metadata: {
        kind: 'subscription',
        tenant_id: tdb.tenantId,
        intent_id: intent.id,
        cycle_id: cycle.id,
        attempt_id: attempt.id,
        plan: offer.plan,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    await markCheckoutFailed(tdb, intent.id, attempt.id, reason);
    throw new BillingError(`Payment could not be started: ${reason}`, 502);
  }

  await attachGatewayResult(tdb, intent, attempt.id, created);

  return {
    checkoutUrl: created.checkoutUrl,
    intentId: intent.id,
    amountXof: offer.priceXof,
    gatewayReference: created.reference,
    cycleId: cycle.id,
    attemptId: attempt.id,
  };
}

/**
 * Opens a checkout for a one-off credit pack. No cycle, no subscription: bought
 * credits are not tied to a period and never expire (specs §1).
 */
export async function createTopupCheckout(
  tdb: TenantDb,
  packId: unknown,
  options: CheckoutOptions = {}
): Promise<CheckoutResult> {
  const pack: TopupPack = getTopupPack(packId);
  const client = resolveClient(options);
  const baseUrl = options.baseUrl ?? appBaseUrl();

  const [intent] = await tdb.insert(paymentIntents, {
    kind: 'topup',
    amountXof: assertXofAmount(pack.priceXof),
    creditsGranted: pack.credits,
    status: 'created',
    metadata: { pack_id: pack.id },
  });

  const { successUrl, errorUrl } = returnUrls(baseUrl, intent.id);

  let created: CreatedPayment;
  try {
    created = await client.createPayment({
      amountXof: pack.priceXof,
      description: `GenTube — recharge de ${pack.credits.toLocaleString('fr-FR')} crédits`,
      successUrl,
      errorUrl,
      metadata: {
        kind: 'topup',
        tenant_id: tdb.tenantId,
        intent_id: intent.id,
        pack_id: pack.id,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    await markCheckoutFailed(tdb, intent.id, undefined, reason);
    throw new BillingError(`Payment could not be started: ${reason}`, 502);
  }

  await attachGatewayResult(tdb, intent, undefined, created);

  return {
    checkoutUrl: created.checkoutUrl,
    intentId: intent.id,
    amountXof: pack.priceXof,
    gatewayReference: created.reference,
  };
}

export type BillingOverview = {
  plan: string;
  creditsBalance: number;
  billingConfigured: boolean;
  subscription: Subscription | null;
  currentCycle: BillingCycle | null;
  offers: PlanOffer[];
  topupPacks: TopupPack[];
  payments: PaymentIntent[];
  ledger: Awaited<ReturnType<typeof recentLedger>>;
};

async function recentLedger(tdb: TenantDb) {
  return await tdb.findMany(creditLedger, undefined, {
    orderBy: [desc(creditLedger.createdAt), desc(creditLedger.id)],
    limit: 10,
  });
}

/** Everything the billing page shows, in one tenant-scoped read. */
export async function getBillingOverview(
  tdb: TenantDb
): Promise<BillingOverview> {
  const tenant = await tdb.getTenant();
  if (!tenant) throw new BillingError('Tenant not found.', 404);

  const subscription = await getSubscription(tdb);
  const currentCycle = subscription
    ? await tdb.findFirst(
        billingCycles,
        eq(billingCycles.subscriptionId, subscription.id),
        { orderBy: [desc(billingCycles.id)] }
      )
    : null;

  return {
    plan: tenant.plan,
    creditsBalance: await getBalance(tdb),
    billingConfigured: isBillingConfigured(),
    subscription,
    currentCycle,
    offers: Object.values(PLAN_OFFERS),
    topupPacks: TOPUP_PACKS_FOR_SALE,
    payments: await tdb.findMany(paymentIntents, undefined, {
      orderBy: [desc(paymentIntents.createdAt), desc(paymentIntents.id)],
      limit: 10,
    }),
    ledger: await recentLedger(tdb),
  };
}
