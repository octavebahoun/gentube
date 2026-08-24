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
 * Inbound GeniusPay webhooks — the only place a payment turns into credits.
 *
 * Order of the pipeline, and why:
 *
 *  1. parse the body                     — malformed input never reaches Postgres
 *  2. check the timestamp                — cheap half of replay protection
 *  3. verify the HMAC signature          — 401 and NOT ONE ROW WRITTEN
 *  4. log the event, unique on event id  — idempotency guard, audit trail
 *  5. resolve the tenant from OUR row    — never from the payload's metadata
 *  6. re-fetch the payment               — the gateway is the authority
 *  7. compare status, amount, currency   — a forged body cannot agree with it
 *  8. credit, in one transaction         — ledger keyed on the payment reference
 *
 * Step 3 before step 4 is a deliberate departure from the Contravo pipeline,
 * which logs first for auditability: writing before verifying hands an
 * unauthenticated caller a table to fill. Signature first means a forged
 * callback leaves nothing at all behind, which is what the specs require.
 *
 * A verified event that fails later (the gateway is unreachable, say) is left
 * with `processed_at` null, so a redelivery is allowed to run again — while the
 * ledger's idempotency key, derived from the payment reference rather than the
 * event id, keeps a second success from crediting twice.
 */

export type WebhookOutcome = {
  status: number;
  body: { ok: boolean; message: string };
  /** Machine-readable decision, for tests and logs. */
  outcome: string;
};

export type ProcessWebhookOptions = {
  /** Injectable for tests; production builds one from the environment. */
  client?: GeniusPayClient;
  webhookSecret?: string;
  ip?: string | null;
  now?: number;
};

function reply(status: number, outcome: string, message: string): WebhookOutcome {
  return { status, body: { ok: status < 400, message }, outcome };
}

/**
 * Unscoped reads and writes live in this file only.
 *
 * A webhook arrives with no session and no tenant: the tenant is what this
 * pipeline *resolves*, from a gateway reference stored in our own
 * `payment_intents`. It is the same exception `getUser()` makes in
 * lib/db/queries.ts, and it stops here — every write that touches money goes
 * through `tenantDb()` below.
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

/** Whole-XOF reading of an amount the gateway reported. */
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
    // Nothing written: a stale timestamp is either a replay or a clock problem,
    // and neither deserves a row.
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

  // --- Verified. From here on the event is recorded. ---

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
      // Lost the insert race and cannot find the row: let the gateway retry.
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
    // 502, not 200: nothing has been decided, so the gateway should redeliver.
    // `processed_at` is still null, which lets the redelivery run the pipeline.
    return reply(502, 'refetch_failed', 'Could not re-read the payment.');
  }

  if (payment.currency && payment.currency.toUpperCase() !== CURRENCY) {
    await annotateEvent(eventRow.id, { processingError: 'currency_mismatch' });
    return reply(200, 'currency_mismatch', 'Payment is not in XOF.');
  }

  const tdb = tenantDb(intent.tenantId);
  const settled = xof(payment.amount);

  if (eventType === PAYMENT_SUCCESS_EVENT) {
    // The gateway's own record, not the callback, decides whether money moved.
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
    // A failure callback for a payment the gateway reports as paid is a
    // contradiction: do nothing, and let the success event (or a human) settle
    // it. Marking it failed here would strand a paid tenant.
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
 * Grants what was paid for, in one transaction: the intent, the credits, and —
 * for a subscription — the cycle, the subscription period and the tenant's
 * plan. The plan changes here and nowhere else: not at checkout, not on the
 * callback alone.
 */
async function creditConfirmedPayment(
  tdb: ReturnType<typeof tenantDb>,
  intent: PaymentIntent,
  payment: GeniusPayPayment,
  reference: string
): Promise<void> {
  // A malformed `completed_at` must not reach a timestamp column: the gateway's
  // date is a nice-to-have, the fact that it settled is what matters.
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
        // Keyed on the payment, not the event: a redelivery under a fresh event
        // id still resolves to the same key and moves nothing.
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

    // The tenant's plan is what the rest of the app reads.
    await tx.updateTenant({ plan: cycle.plan, updatedAt: new Date() });
  });
}

/**
 * Records a payment that did not go through. No credit moves, and the balance
 * already bought is untouched — a suspended subscription stops renewing, it
 * does not confiscate.
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

    // Retries exhausted (specs §3.A): close the cycle and stop the renewal.
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
