import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import {
  billingCycles,
  paymentAttempts,
  paymentIntents,
  subscriptions,
  type BillingCycle,
  type PaymentIntent,
  type Plan,
  type Subscription,
} from '@/lib/db/schema';
import { expirePlanCredits, grantCredits } from '@/lib/credits/ledger';
import {
  GeniusPayClient,
  type InitiatePaymentParams,
} from '@/lib/payments/geniuspay/client';
import {
  getPlatformCredentials,
  resolveEnvironment,
} from '@/lib/payments/credentials';
import {
  BILLING_CURRENCY,
  MAX_PAYMENT_ATTEMPTS,
  PURCHASABLE_PLANS,
  TOPUP_PACKS,
  cycleEnd,
  invoiceNumber,
  isPurchasablePlan,
  planCredits,
  planPriceXof,
  topUpPack,
} from './plans';

export class BillingError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

function appUrl(): string {
  return (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Builds a gateway client from the platform's stored credentials.
 *
 * The secret is read here and handed straight to the client; it is never
 * returned to a caller. A missing credential is a 503, not a crash: the
 * checkout page must be able to say "billing is not configured yet" rather
 * than blow up.
 */
async function platformClient() {
  const environment = resolveEnvironment();
  const credentials = await getPlatformCredentials(environment);

  if (!credentials) {
    throw new BillingError(
      'Le paiement en ligne n’est pas encore configuré sur cette instance.',
      503
    );
  }

  return {
    environment,
    client: new GeniusPayClient(
      credentials.apiKeyPublic,
      credentials.apiSecret,
      environment
    ),
  };
}

export async function getSubscription(
  tdb: TenantDb
): Promise<Subscription | null> {
  return await tdb.findFirst(subscriptions);
}

export type BillingOverview = {
  plan: Plan;
  balances: { total: number; plan: number; purchased: number };
  subscription: Subscription | null;
  cycles: BillingCycle[];
  payments: PaymentIntent[];
  packs: { index: number; priceXof: number; credits: number }[];
  plans: { id: string; priceXof: number; credits: number }[];
  configured: boolean;
};

/** Everything the billing page shows, in one tenant-scoped read. */
export async function getBillingOverview(
  tdb: TenantDb
): Promise<BillingOverview> {
  const tenant = await tdb.getTenant();
  if (!tenant) throw new BillingError('Tenant not found', 404);

  const [subscription, cycles, payments, credentials] = await Promise.all([
    getSubscription(tdb),
    tdb.findMany(billingCycles, undefined, {
      orderBy: [desc(billingCycles.cycleNumber)],
      limit: 12,
    }),
    tdb.findMany(paymentIntents, undefined, {
      orderBy: [desc(paymentIntents.createdAt), desc(paymentIntents.id)],
      limit: 20,
    }),
    getPlatformCredentials(resolveEnvironment()).catch(() => null),
  ]);

  return {
    plan: tenant.plan,
    balances: {
      total: tenant.creditsBalance,
      plan: tenant.planCreditsBalance,
      purchased: tenant.creditsBalance - tenant.planCreditsBalance,
    },
    subscription,
    cycles,
    payments,
    packs: TOPUP_PACKS.map((pack, index) => ({
      index,
      priceXof: pack.priceFcfa,
      credits: pack.credits,
    })),
    plans: PURCHASABLE_PLANS.map((id) => ({
      id,
      priceXof: planPriceXof(id),
      credits: planCredits(id),
    })),
    // Drives the "billing is not set up yet" state instead of letting the
    // subscribe button fail with a 503 after the user clicks it.
    configured: credentials !== null,
  };
}

/** The tenant's subscription, created on first use if it does not exist. */
export async function getOrCreateSubscription(
  tdb: TenantDb
): Promise<Subscription> {
  const existing = await getSubscription(tdb);
  if (existing) return existing;

  const tenant = await tdb.getTenant();
  if (!tenant) throw new BillingError('Tenant not found', 404);

  const now = new Date();
  const [created] = await tdb.insert(subscriptions, {
    plan: tenant.plan,
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: cycleEnd(now),
  });
  return created;
}

type CheckoutResult = {
  intent: PaymentIntent;
  checkoutUrl: string;
};

/**
 * Creates the local records, then opens the gateway checkout.
 *
 * The local rows are written *before* the gateway call because their ids
 * travel in the payment metadata — that is how the confirmation webhook finds
 * its way back. When the gateway refuses, they are marked failed rather than
 * left pending: a pending row that is waiting for nothing corrupts the billing
 * history.
 */
async function openCheckout(
  tdb: TenantDb,
  params: {
    kind: 'subscription' | 'topup';
    amountXof: number;
    creditsGranted: number;
    description: string;
    billingCycleId?: number;
    paymentAttemptId?: number;
    initiatedFromIp?: string | null;
    successPath: string;
    errorPath: string;
    extraMetadata?: Record<string, unknown>;
  }
): Promise<CheckoutResult> {
  const { environment, client } = await platformClient();

  const [intent] = await tdb.insert(paymentIntents, {
    kind: params.kind,
    environment,
    billingCycleId: params.billingCycleId ?? null,
    paymentAttemptId: params.paymentAttemptId ?? null,
    amountXof: params.amountXof,
    currency: BILLING_CURRENCY,
    // Recorded now, from our own price table. The webhook grants exactly this
    // many credits and never recomputes anything from the payload it receives.
    creditsGranted: params.creditsGranted,
    status: 'created',
    initiatedFromIp: params.initiatedFromIp ?? null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    metadata: params.extraMetadata ?? {},
  });

  const request: InitiatePaymentParams = {
    amount: params.amountXof,
    currency: BILLING_CURRENCY,
    description: params.description,
    successUrl: `${appUrl()}${params.successPath}?status=success&intent=${intent.id}`,
    errorUrl: `${appUrl()}${params.errorPath}?status=failed&intent=${intent.id}`,
    metadata: {
      kind: params.kind,
      tenant_id: tdb.tenantId,
      payment_intent_id: intent.id,
      ...(params.billingCycleId ? { billing_cycle_id: params.billingCycleId } : {}),
      ...(params.paymentAttemptId
        ? { payment_attempt_id: params.paymentAttemptId }
        : {}),
    },
  };

  try {
    const response = await client.initiatePayment(request);
    const checkoutUrl = response.data?.checkout_url ?? response.data?.payment_url;

    // A response with no URL is a failure whatever `success` claims — there is
    // nowhere to send the payer.
    if (!response.success || !response.data || !checkoutUrl) {
      throw new Error(
        response.error?.message ?? 'GeniusPay returned no checkout URL.'
      );
    }

    const [updated] = await tdb.update(
      paymentIntents,
      {
        gatewayReference: response.data.reference,
        checkoutUrl,
        status: 'pending',
        gatewayStatus: response.data.status,
        updatedAt: new Date(),
      },
      eq(paymentIntents.id, intent.id)
    );

    return { intent: updated, checkoutUrl };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';

    await tdb.update(
      paymentIntents,
      { status: 'failed', failureReason: reason, updatedAt: new Date() },
      eq(paymentIntents.id, intent.id)
    );

    if (params.paymentAttemptId && params.billingCycleId) {
      await markAttemptFailed(tdb, {
        billingCycleId: params.billingCycleId,
        paymentAttemptId: params.paymentAttemptId,
        reason,
      });
    }

    throw new BillingError(
      `Échec de l’initialisation du paiement : ${reason}`,
      502
    );
  }
}

/** Starts a subscription or a plan change. Returns the checkout URL. */
export async function createSubscriptionCheckout(
  tdb: TenantDb,
  plan: Plan,
  options: { initiatedFromIp?: string | null } = {}
): Promise<CheckoutResult & { cycle: BillingCycle }> {
  if (!isPurchasablePlan(plan)) {
    throw new BillingError(
      `Le plan "${plan}" se souscrit sur devis, pas en libre-service.`,
      400
    );
  }

  const subscription = await getOrCreateSubscription(tdb);
  const amountXof = planPriceXof(plan);
  const credits = planCredits(plan);

  const [lastCycle] = await tdb.findMany(
    billingCycles,
    eq(billingCycles.subscriptionId, subscription.id),
    { orderBy: [desc(billingCycles.cycleNumber)], limit: 1 }
  );

  const cycleNumber = (lastCycle?.cycleNumber ?? 0) + 1;
  const start = new Date();

  const [cycle] = await tdb.insert(billingCycles, {
    subscriptionId: subscription.id,
    cycleNumber,
    plan,
    periodStart: start,
    periodEnd: cycleEnd(start),
    amountXof,
    creditsGranted: credits,
    status: 'pending',
    invoiceNumber: invoiceNumber(tdb.tenantId, cycleNumber, start),
  });

  const [attempt] = await tdb.insert(paymentAttempts, {
    billingCycleId: cycle.id,
    attemptNumber: 1,
    status: 'pending',
  });

  const result = await openCheckout(tdb, {
    kind: 'subscription',
    amountXof,
    creditsGranted: credits,
    description: `Abonnement GenTube ${plan}`,
    billingCycleId: cycle.id,
    paymentAttemptId: attempt.id,
    initiatedFromIp: options.initiatedFromIp,
    successPath: '/dashboard/billing',
    errorPath: '/dashboard/billing',
    extraMetadata: { plan, cycle_number: cycleNumber },
  });

  return { ...result, cycle };
}

/** Buys a credit pack. Purchased credits never expire. */
export async function createTopUpCheckout(
  tdb: TenantDb,
  packIndex: number,
  options: { initiatedFromIp?: string | null } = {}
): Promise<CheckoutResult> {
  const pack = topUpPack(packIndex);

  return await openCheckout(tdb, {
    kind: 'topup',
    amountXof: pack.priceFcfa,
    creditsGranted: pack.credits,
    description: `Recharge GenTube — ${pack.credits} crédits`,
    initiatedFromIp: options.initiatedFromIp,
    successPath: '/dashboard/billing',
    errorPath: '/dashboard/billing',
    extraMetadata: { pack_index: packIndex },
  });
}

/**
 * Books a confirmed payment: credits granted, intent closed, and for a
 * subscription, the cycle and the plan moved forward.
 *
 * `eventId` is the gateway's event id and becomes the ledger idempotency key,
 * so replaying the same event can never grant twice — the DB constraint on
 * `credit_ledger.idempotency_key` enforces it, not a code path.
 */
export async function settlePayment(
  tdb: TenantDb,
  params: {
    intent: PaymentIntent;
    eventId: string;
    gatewayStatus?: string;
    paymentMethod?: string | null;
    feesXof?: number | null;
    netXof?: number | null;
    completedAt?: Date;
  }
): Promise<{ creditsGranted: number; balance: number }> {
  const { intent, eventId } = params;

  return await tdb.transaction(async (tx) => {
    const [current] = await tx.findMany(
      paymentIntents,
      eq(paymentIntents.id, intent.id)
    );

    // Already settled by an earlier delivery of this or another event.
    if (current?.status === 'succeeded') {
      const tenant = await tx.getTenant();
      return {
        creditsGranted: 0,
        balance: tenant?.creditsBalance ?? 0,
      };
    }

    await tx.update(
      paymentIntents,
      {
        status: 'succeeded',
        gatewayStatus: params.gatewayStatus ?? 'completed',
        gatewayPaymentMethod: params.paymentMethod ?? null,
        gatewayFeesXof: params.feesXof ?? null,
        gatewayNetXof: params.netXof ?? null,
        succeededAt: params.completedAt ?? new Date(),
        updatedAt: new Date(),
      },
      eq(paymentIntents.id, intent.id)
    );

    if (intent.kind === 'subscription' && intent.billingCycleId) {
      return await settleSubscriptionCycle(tx, intent, eventId);
    }

    const { balance } = await grantCredits(tx, {
      amount: intent.creditsGranted,
      reason: 'topup',
      idempotencyKey: `geniuspay:${eventId}`,
      // Purchased credits outlive the billing cycle (specs §1).
      expiring: false,
    });

    return { creditsGranted: intent.creditsGranted, balance };
  });
}

async function settleSubscriptionCycle(
  tx: TenantDb,
  intent: PaymentIntent,
  eventId: string
): Promise<{ creditsGranted: number; balance: number }> {
  const cycle = await tx.findById(billingCycles, intent.billingCycleId!);
  if (!cycle) {
    throw new BillingError('Billing cycle not found for this payment.', 404);
  }

  if (intent.paymentAttemptId) {
    await tx.update(
      paymentAttempts,
      {
        status: 'succeeded',
        gatewayReference: intent.gatewayReference,
        updatedAt: new Date(),
      },
      eq(paymentAttempts.id, intent.paymentAttemptId)
    );
  }

  await tx.update(
    billingCycles,
    { status: 'paid', paidAt: new Date(), updatedAt: new Date() },
    eq(billingCycles.id, cycle.id)
  );

  // The previous cycle's unused allowance dies here, before the new one is
  // granted. Purchased credits are untouched — they sit in the other bucket.
  await expirePlanCredits(tx);

  const { balance } = await grantCredits(tx, {
    amount: cycle.creditsGranted,
    reason: 'subscription_grant',
    idempotencyKey: `geniuspay:${eventId}`,
    expiring: true,
  });

  await tx.update(
    subscriptions,
    {
      plan: cycle.plan,
      status: 'active',
      currentPeriodStart: cycle.periodStart,
      currentPeriodEnd: cycle.periodEnd,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      updatedAt: new Date(),
    },
    eq(subscriptions.id, cycle.subscriptionId)
  );

  // The tenant's plan label follows the cycle that was actually paid for.
  await tx.updateTenant({ plan: cycle.plan, updatedAt: new Date() });

  return { creditsGranted: cycle.creditsGranted, balance };
}

/** Records a refused payment and, after enough of them, suspends the tenant. */
export async function markAttemptFailed(
  tdb: TenantDb,
  params: {
    billingCycleId: number;
    paymentAttemptId?: number | null;
    reason: string;
  }
): Promise<{ suspended: boolean; attempts: number }> {
  return await tdb.transaction(async (tx) => {
    if (params.paymentAttemptId) {
      await tx.update(
        paymentAttempts,
        { status: 'failed', error: params.reason, updatedAt: new Date() },
        eq(paymentAttempts.id, params.paymentAttemptId)
      );
    }

    await tx.update(
      billingCycles,
      { status: 'failed', failedReason: params.reason, updatedAt: new Date() },
      eq(billingCycles.id, params.billingCycleId)
    );

    const failures = await tx.count(
      paymentAttempts,
      and(
        eq(paymentAttempts.billingCycleId, params.billingCycleId),
        eq(paymentAttempts.status, 'failed')
      )!
    );

    const cycle = await tx.findById(billingCycles, params.billingCycleId);
    const suspended = failures >= MAX_PAYMENT_ATTEMPTS;

    if (cycle) {
      await tx.update(
        subscriptions,
        {
          status: suspended ? 'suspended' : 'past_due',
          updatedAt: new Date(),
        },
        eq(subscriptions.id, cycle.subscriptionId)
      );
    }

    return { suspended, attempts: failures };
  });
}

/** Retries a failed cycle with a fresh attempt and a fresh checkout. */
export async function retrySubscriptionPayment(
  tdb: TenantDb,
  billingCycleId: number,
  options: { initiatedFromIp?: string | null } = {}
): Promise<CheckoutResult> {
  const cycle = await tdb.findById(billingCycles, billingCycleId);
  if (!cycle) throw new BillingError('Cycle introuvable.', 404);
  if (cycle.status === 'paid') {
    throw new BillingError('Ce cycle est déjà réglé.', 400);
  }

  const attempts = await tdb.count(
    paymentAttempts,
    eq(paymentAttempts.billingCycleId, billingCycleId)
  );
  if (attempts >= MAX_PAYMENT_ATTEMPTS) {
    throw new BillingError(
      'Nombre maximum de tentatives atteint pour ce cycle. Contactez le support.',
      409
    );
  }

  const [attempt] = await tdb.insert(paymentAttempts, {
    billingCycleId,
    attemptNumber: attempts + 1,
    status: 'pending',
  });

  return await openCheckout(tdb, {
    kind: 'subscription',
    amountXof: cycle.amountXof,
    creditsGranted: cycle.creditsGranted,
    description: `Abonnement GenTube ${cycle.plan} (relance)`,
    billingCycleId: cycle.id,
    paymentAttemptId: attempt.id,
    initiatedFromIp: options.initiatedFromIp,
    successPath: '/dashboard/billing',
    errorPath: '/dashboard/billing',
    extraMetadata: { plan: cycle.plan, retry_of_cycle: cycle.cycleNumber },
  });
}

/**
 * Schedules a downgrade. The paid period stays open until `currentPeriodEnd` —
 * the tenant keeps what it already paid for. No proration, no refund.
 */
export async function cancelSubscription(tdb: TenantDb): Promise<Subscription> {
  const subscription = await getSubscription(tdb);
  if (!subscription) throw new BillingError('Aucun abonnement actif.', 404);
  if (subscription.cancelAtPeriodEnd) {
    throw new BillingError('La résiliation est déjà programmée.', 400);
  }

  const [updated] = await tdb.update(
    subscriptions,
    {
      cancelAtPeriodEnd: true,
      cancelAt: subscription.currentPeriodEnd,
      cancelledAt: new Date(),
      updatedAt: new Date(),
    },
    eq(subscriptions.id, subscription.id)
  );
  return updated;
}

/** Undoes a scheduled downgrade while the paid period is still running. */
export async function resumeSubscription(tdb: TenantDb): Promise<Subscription> {
  const subscription = await getSubscription(tdb);
  if (!subscription) throw new BillingError('Aucun abonnement actif.', 404);
  if (!subscription.cancelAtPeriodEnd) {
    throw new BillingError('Aucune résiliation n’est programmée.', 400);
  }

  const [updated] = await tdb.update(
    subscriptions,
    {
      cancelAtPeriodEnd: false,
      cancelAt: null,
      cancelledAt: null,
      updatedAt: new Date(),
    },
    eq(subscriptions.id, subscription.id)
  );
  return updated;
}
