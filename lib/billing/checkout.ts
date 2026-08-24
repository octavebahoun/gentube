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
 * Checkout — la moitié payante de la facturation.
 *
 * Rien ici n'accorde un seul crédit. Un checkout ne fait que créer les lignes
 * locales auxquelles la confirmation de la passerelle sera ensuite comparée,
 * et renvoie une URL. Les crédits bougent dans lib/billing/webhook.ts, après
 * que le paiement a été re-lu depuis la passerelle.
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
  /** Injectable pour les tests ; la production en construit un depuis l'environnement. */
  client?: GeniusPayClient;
  baseUrl?: string;
};

/** Seul un owner ou un admin peut changer la facturation du workspace. */
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

/** La ligne d'abonnement du tenant, créée au premier checkout. */
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

  // Créé `pending` : le plan de la ligne est ce qui est en cours d'achat, et
  // seul le paiement confirmé en fait le plan réel du tenant.
  const [created] = await tdb.insert(subscriptions, {
    plan: plan.plan,
    status: 'pending',
  });
  return created;
}

/**
 * Le cycle auquel appartient une nouvelle tentative.
 *
 * Un cycle non payé du même plan est réutilisé, donc trois essais pour la
 * même facture mensuelle sont trois `payment_attempts` sur un seul cycle
 * plutôt que trois cycles — ce qui rend « réessayer, puis suspendre » (cahier
 * des charges §3.A) comptable. Une fois qu'un cycle a brûlé ses réessais, le
 * checkout suivant en ouvre un neuf, pour qu'un tenant suspendu puisse
 * toujours payer pour revenir.
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
 * Enregistre ce que la passerelle a répondu, ou ferme les lignes qu'elle n'a
 * jamais acceptées.
 *
 * Les lignes locales sont écrites *avant* l'appel car leurs ids voyagent dans
 * les métadonnées de la passerelle ; un appel échoué doit donc les marquer
 * comme échouées plutôt que de laisser un paiement « pending » que rien
 * n'attend.
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
  // Le cycle reste `pending` : la période est toujours impayée et réutilisable.
  // Seuls les réessais épuisés le ferment (voir lib/billing/webhook.ts).
}

/**
 * Ouvre un checkout pour un plan mensuel. Le plan du tenant ne change pas ici —
 * il change quand le paiement est confirmé.
 */
export async function createSubscriptionCheckout(
  tdb: TenantDb,
  plan: unknown,
  options: CheckoutOptions = {}
): Promise<CheckoutResult> {
  const offer = getPlanOffer(plan);
  // La configuration est vérifiée avant la première écriture, pour qu'une
  // instance mal configurée réponde « non configuré » au lieu de laisser des
  // lignes orphelines derrière elle.
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
      // Informatives seulement. Le webhook résout le tenant depuis la
      // référence passerelle qu'il trouve dans notre propre ligne
      // payment_intents, jamais depuis ceci — les métadonnées sont fournies
      // par un attaquant au retour.
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
 * Ouvre un checkout pour un pack de crédits ponctuel. Pas de cycle, pas
 * d'abonnement : les crédits achetés ne sont liés à aucune période et
 * n'expirent jamais (cahier des charges §1).
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

/** Tout ce que la page de facturation affiche, en une seule lecture scopée au tenant. */
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
