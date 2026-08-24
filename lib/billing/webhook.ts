import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import {
  billingCycles,
  paymentAttempts,
  paymentIntents,
  paymentWebhookEvents,
  subscriptions,
  type PaymentIntent,
  type PaymentWebhookEvent,
} from '@/lib/db/schema';
import { grantCredits } from '@/lib/credits';
import {
  GeniusPayClient,
  PAYMENT_SUCCESS_EVENT,
  createGeniusPayClient,
  isFailureEvent,
  isFreshTimestamp,
  isPaidStatus,
  verifyWebhookSignature,
  type GeniusPayPayment,
} from '@/lib/payments/geniuspay';
import { CURRENCY, MAX_PAYMENT_ATTEMPTS } from './plans';
import { geniusPayConfig } from './config';

/**
 * Webhooks entrants GeniusPay — le seul endroit où un paiement devient des
 * crédits.
 *
 * Ordre du pipeline, et pourquoi :
 *
 *  1. parser le corps                    — une entrée malformée n'atteint jamais Postgres
 *  2. vérifier l'horodatage              — la moitié bon marché de la protection anti-replay
 *  3. vérifier la signature HMAC         — 401 et PAS UNE LIGNE ÉCRITE
 *  4. journaliser l'événement, unique sur l'id d'événement — garde idempotence, piste d'audit
 *  5. résoudre le tenant depuis NOTRE ligne — jamais depuis les métadonnées du payload
 *  6. re-lire le paiement                — la passerelle fait autorité
 *  7. comparer statut, montant, devise   — un corps forgé ne peut pas concorder avec elle
 *  8. créditer, en une transaction       — grand livre clé sur la référence de paiement
 *
 * L'étape 3 avant l'étape 4 s'écarte délibérément du pipeline Contravo, qui
 * journalise d'abord pour l'auditabilité : écrire avant de vérifier offre à un
 * appelant non authentifié une table à remplir. Signature d'abord signifie
 * qu'un callback forgé ne laisse rien derrière lui, comme l'exige le cahier
 * des charges.
 *
 * Un événement vérifié qui échoue plus loin (la passerelle est injoignable,
 * par exemple) reste avec `processed_at` null, donc une redelivery peut
 * repartir — tandis que la clé d'idempotence du grand livre, dérivée de la
 * référence de paiement plutôt que de l'id d'événement, empêche un second
 * succès de créditer deux fois.
 */

export type WebhookOutcome = {
  status: number;
  body: { ok: boolean; message: string };
  /** Décision lisible par machine, pour les tests et les logs. */
  outcome: string;
};

export type ProcessWebhookOptions = {
  /** Injectable pour les tests ; la production en construit un depuis l'environnement. */
  client?: GeniusPayClient;
  webhookSecret?: string;
  ip?: string | null;
  now?: number;
};

function reply(status: number, outcome: string, message: string): WebhookOutcome {
  return { status, body: { ok: status < 400, message }, outcome };
}

/**
 * Lectures et écritures sans scope : uniquement dans ce fichier.
 *
 * Un webhook arrive sans session et sans tenant : le tenant est ce que ce
 * pipeline *résout*, depuis une référence passerelle stockée dans nos propres
 * `payment_intents`. C'est la même exception que getUser() dans
 * lib/db/queries.ts, et elle s'arrête ici — chaque écriture touchant à
 * l'argent passe par `tenantDb()` ci-dessous.
 */
async function findIntentByReference(
  reference: string
): Promise<PaymentIntent | null> {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.gatewayReference, reference))
    .limit(1);
  return intent ?? null;
}

async function annotateEvent(
  eventRowId: number,
  patch: Partial<PaymentWebhookEvent>
): Promise<void> {
  await db
    .update(paymentWebhookEvents)
    .set(patch)
    .where(eq(paymentWebhookEvents.id, eventRowId));
}

/** Lecture en XOF entier d'un montant rapporté par la passerelle. */
function xof(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

export async function processGeniusPayWebhook(
  headers: Record<string, string>,
  rawBody: string,
  options: ProcessWebhookOptions = {}
): Promise<WebhookOutcome> {
  const now = options.now ?? Date.now();

  const contentType = headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return reply(400, 'invalid_content_type', 'Expected application/json.');
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return reply(400, 'invalid_json', 'Body is not valid JSON.');
  }

  const eventId =
    payload?.id === undefined || payload?.id === null
      ? null
      : String(payload.id);
  const eventType: string | null =
    payload?.event ?? headers['x-webhook-event'] ?? null;

  if (!eventId || !eventType) {
    return reply(400, 'missing_event_fields', 'Missing event id or type.');
  }

  const signatureTimestamp = headers['x-webhook-timestamp'] ?? null;
  if (!isFreshTimestamp(signatureTimestamp ?? payload?.timestamp, { now })) {
    // Rien d'écrit : un horodatage périmé est soit un replay, soit un problème
    // d'horloge, et aucun des deux ne mérite une ligne.
    return reply(400, 'timestamp_expired', 'Timestamp outside tolerance.');
  }

  const webhookSecret =
    options.webhookSecret ?? geniusPayConfig().webhookSecret;

  const signatureValid = verifyWebhookSignature({
    signature: headers['x-webhook-signature'],
    timestamp: signatureTimestamp,
    rawBody,
    secret: webhookSecret,
  });

  if (!signatureValid) {
    return reply(401, 'invalid_signature', 'Invalid signature.');
  }

  // --- Vérifié. À partir d'ici l'événement est enregistré. ---

  const environment =
    payload?.environment ?? headers['x-webhook-environment'] ?? null;
  const reference: string | null = payload?.data?.reference ?? null;

  const [inserted] = await db
    .insert(paymentWebhookEvents)
    .values({
      provider: 'geniuspay',
      eventId,
      eventType,
      environment,
      gatewayReference: reference,
      payload,
      signatureValid: true,
      receivedFromIp: options.ip ?? null,
    })
    .onConflictDoNothing({
      target: [paymentWebhookEvents.provider, paymentWebhookEvents.eventId],
    })
    .returning();

  let eventRow = inserted ?? null;
  if (!eventRow) {
    const [existing] = await db
      .select()
      .from(paymentWebhookEvents)
      .where(
        and(
          eq(paymentWebhookEvents.provider, 'geniuspay'),
          eq(paymentWebhookEvents.eventId, eventId)
        )
      )
      .limit(1);

    if (existing?.processedAt) {
      return reply(200, 'duplicate', 'Event already processed.');
    }
    eventRow = existing ?? null;
    if (!eventRow) {
      // Perdu la course à l'insert et la ligne introuvable : laisser la
      // passerelle réessayer.
      return reply(409, 'event_row_missing', 'Concurrent delivery, retry.');
    }
  }

  if (!reference) {
    await annotateEvent(eventRow.id, { processingError: 'missing_reference' });
    return reply(200, 'missing_reference', 'No payment reference in payload.');
  }

  const intent = await findIntentByReference(reference);
  if (!intent) {
    await annotateEvent(eventRow.id, { processingError: 'unknown_reference' });
    return reply(200, 'unknown_reference', 'No payment intent for reference.');
  }

  await annotateEvent(eventRow.id, { tenantId: intent.tenantId });

  const client = options.client ?? createGeniusPayClient();

  let payment: GeniusPayPayment;
  try {
    payment = await client.fetchPayment(reference);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    await annotateEvent(eventRow.id, {
      processingError: `refetch_failed: ${message}`,
    });
    // 502, pas 200 : rien n'a été décidé, la passerelle doit donc redélivrer.
    // `processed_at` est toujours null, ce qui laisse la redelivery exécuter
    // le pipeline.
    return reply(502, 'refetch_failed', 'Could not re-read the payment.');
  }

  if (payment.currency && payment.currency.toUpperCase() !== CURRENCY) {
    await annotateEvent(eventRow.id, { processingError: 'currency_mismatch' });
    return reply(200, 'currency_mismatch', 'Payment is not in XOF.');
  }

  const tdb = tenantDb(intent.tenantId);
  const settled = xof(payment.amount);

  if (eventType === PAYMENT_SUCCESS_EVENT) {
    // L'enregistrement propre de la passerelle, pas le callback, décide si
    // de l'argent a bougé.
    if (!isPaidStatus(payment.status)) {
      await annotateEvent(eventRow.id, {
        processingError: `gateway_status_not_paid: ${payment.status ?? 'none'}`,
      });
      return reply(
        200,
        'gateway_contradicts_webhook',
        'Gateway does not report this payment as paid.'
      );
    }

    if (settled === null || settled !== intent.amountXof) {
      await annotateEvent(eventRow.id, { processingError: 'amount_mismatch' });
      console.error(
        `CRITICAL: settled amount differs from intent ${intent.id} — ` +
          `gateway ${String(settled)} XOF, intent ${intent.amountXof} XOF.`
      );
      return reply(200, 'amount_mismatch', 'Settled amount differs.');
    }

    await creditConfirmedPayment(tdb, intent, payment, reference);
    await annotateEvent(eventRow.id, {
      processedAt: new Date(),
      processingError: null,
    });
    return reply(200, 'credited', 'Payment confirmed and credits granted.');
  }

  if (isFailureEvent(eventType)) {
    // Un callback d'échec pour un paiement que la passerelle déclare payé est
    // une contradiction : ne rien faire, et laisser l'événement de succès (ou
    // un humain) trancher. Le marquer échoué ici bloquerait un tenant qui a
    // payé.
    if (isPaidStatus(payment.status)) {
      await annotateEvent(eventRow.id, {
        processingError: 'failure_event_but_gateway_paid',
      });
      return reply(
        200,
        'gateway_contradicts_webhook',
        'Gateway reports this payment as paid.'
      );
    }

    await recordFailedPayment(tdb, intent, payment, eventType);
    await annotateEvent(eventRow.id, {
      processedAt: new Date(),
      processingError: null,
    });
    return reply(200, 'failed', 'Payment failure recorded.');
  }

  await annotateEvent(eventRow.id, { processedAt: new Date() });
  return reply(200, 'ignored', `Nothing to do for ${eventType}.`);
}

/**
 * Accorde ce qui a été payé, en une transaction : l'intention, les crédits,
 * et — pour un abonnement — le cycle, la période d'abonnement et le plan du
 * tenant. Le plan change ici et nulle part ailleurs : ni au checkout, ni sur
 * le seul callback.
 */
async function creditConfirmedPayment(
  tdb: ReturnType<typeof tenantDb>,
  intent: PaymentIntent,
  payment: GeniusPayPayment,
  reference: string
): Promise<void> {
  // Un `completed_at` malformé ne doit pas atteindre une colonne timestamp :
  // la date de la passerelle est un plus, le fait qu'il soit réglé est ce qui
  // compte.
  const reported = payment.completed_at ? new Date(payment.completed_at) : null;
  const paidAt =
    reported && !Number.isNaN(reported.getTime()) ? reported : new Date();

  await tdb.transaction(async (tx) => {
    await tx.update(
      paymentIntents,
      {
        status: 'succeeded',
        gatewayStatus: payment.status ?? null,
        paymentMethod: payment.payment_method ?? payment.payment_provider ?? null,
        feesXof: xof(payment.fees),
        netXof: xof(payment.net_amount),
        succeededAt: paidAt,
        failureReason: null,
        updatedAt: new Date(),
      },
      eq(paymentIntents.id, intent.id)
    );

    if (intent.creditsGranted > 0) {
      await grantCredits(tx, {
        amount: intent.creditsGranted,
        reason: intent.kind === 'subscription' ? 'subscription_grant' : 'topup',
        // Clé sur le paiement, pas l'événement : une redelivery sous un nouvel
        // id d'événement résout vers la même clé et ne bouge rien.
        idempotencyKey: `geniuspay:payment:${reference}`,
      });
    }

    if (intent.kind !== 'subscription' || !intent.billingCycleId) return;

    const cycle = await tx.findById(billingCycles, intent.billingCycleId);
    if (!cycle) return;

    await tx.update(
      billingCycles,
      { status: 'paid', paidAt, updatedAt: new Date() },
      eq(billingCycles.id, cycle.id)
    );

    await tx.update(
      paymentAttempts,
      { status: 'succeeded', error: null, updatedAt: new Date() },
      eq(paymentAttempts.paymentIntentId, intent.id)
    );

    await tx.update(
      subscriptions,
      {
        plan: cycle.plan,
        status: 'active',
        currentPeriodStart: cycle.periodStart,
        currentPeriodEnd: cycle.periodEnd,
        cancelAt: null,
        updatedAt: new Date(),
      },
      eq(subscriptions.id, cycle.subscriptionId)
    );

    // Le plan du tenant est ce que le reste de l'application lit.
    await tx.updateTenant({ plan: cycle.plan, updatedAt: new Date() });
  });
}

/**
 * Enregistre un paiement qui n'est pas passé. Aucun crédit ne bouge, et le
 * solde déjà acheté reste intact — un abonnement suspendu cesse de se
 * renouveler, il ne confisque pas.
 */
async function recordFailedPayment(
  tdb: ReturnType<typeof tenantDb>,
  intent: PaymentIntent,
  payment: GeniusPayPayment,
  eventType: string
): Promise<void> {
  const status =
    eventType === 'payment.cancelled'
      ? 'cancelled'
      : eventType === 'payment.expired'
        ? 'expired'
        : 'failed';

  const reason =
    (payment as { failure_reason?: string }).failure_reason ??
    `GeniusPay event: ${eventType}`;

  await tdb.transaction(async (tx) => {
    await tx.update(
      paymentIntents,
      {
        status,
        gatewayStatus: payment.status ?? null,
        failureReason: reason,
        failedAt: new Date(),
        updatedAt: new Date(),
      },
      eq(paymentIntents.id, intent.id)
    );

    if (!intent.billingCycleId) return;

    await tx.update(
      paymentAttempts,
      { status: 'failed', error: reason, updatedAt: new Date() },
      eq(paymentAttempts.paymentIntentId, intent.id)
    );

    const failedAttempts = await tx.count(
      paymentAttempts,
      and(
        eq(paymentAttempts.billingCycleId, intent.billingCycleId),
        eq(paymentAttempts.status, 'failed')
      )
    );

    const cycle = await tx.findById(billingCycles, intent.billingCycleId);
    if (!cycle) return;

    // Réessais épuisés (cahier des charges §3.A) : clore le cycle et stopper
    // le renouvellement.
    if (failedAttempts >= MAX_PAYMENT_ATTEMPTS) {
      await tx.update(
        billingCycles,
        { status: 'failed', updatedAt: new Date() },
        eq(billingCycles.id, cycle.id)
      );
      await tx.update(
        subscriptions,
        { status: 'suspended', updatedAt: new Date() },
        eq(subscriptions.id, cycle.subscriptionId)
      );
      return;
    }

    await tx.update(
      subscriptions,
      { status: 'past_due', updatedAt: new Date() },
      eq(subscriptions.id, cycle.subscriptionId)
    );
  });
}
