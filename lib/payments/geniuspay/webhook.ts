import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import {
  paymentIntents,
  paymentWebhookEvents,
  type GatewayEnvironment,
  type PaymentIntent,
  type PaymentWebhookEvent,
} from '@/lib/db/schema';
import {
  getPlatformCredentials,
  resolveEnvironment,
} from '@/lib/payments/credentials';
import { GeniusPayClient, type GeniusPayPaymentData } from './client';
import {
  BillingError,
  markAttemptFailed,
  settlePayment,
} from '@/lib/billing/billing.service';
import { debitCredits } from '@/lib/credits/ledger';
import { getBalance } from '@/lib/credits/ledger';

/**
 * GeniusPay webhook pipeline.
 *
 * The rule the whole thing exists to enforce: **a webhook never moves credits
 * on its own**. A valid signature only earns the right to ask the gateway what
 * happened; the re-fetched payment is what decides, and the number of credits
 * comes from our own `payment_intents` row, never from the payload.
 *
 * Two queries here run without a tenant filter, both by necessity and both
 * before the tenant is known: the webhook event log (whose `tenant_id` is null
 * until step 6) and the intent lookup by gateway reference, which is what
 * *resolves* the tenant. Everything after that goes through `tenantDb()`.
 */

/** Refetched statuses that mean the money did not stay. */
const FAILED_GATEWAY_STATUSES = new Set([
  'failed',
  'cancelled',
  'canceled',
  'expired',
  'refunded',
  'reversed',
]);

const FAILURE_EVENTS = new Set([
  'payment.failed',
  'payment.cancelled',
  'payment.expired',
]);

export type WebhookResult = {
  status: number;
  body: { success: boolean; message?: string; error?: string };
};

const ok = (message: string): WebhookResult => ({
  status: 200,
  body: { success: true, message },
});

const reject = (
  status: number,
  error: string
): WebhookResult => ({ status, body: { success: false, error } });

async function note(eventRowId: number, processingError: string | null) {
  await db
    .update(paymentWebhookEvents)
    .set({ processingError })
    .where(eq(paymentWebhookEvents.id, eventRowId));
}

export async function processGeniusPayWebhook(
  headers: Record<string, string>,
  rawBody: string,
  clientIp?: string | null
): Promise<WebhookResult> {
  if (!(headers['content-type'] ?? '').includes('application/json')) {
    return reject(400, 'Invalid content type');
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return reject(400, 'Invalid JSON payload');
  }

  const signature = headers['x-webhook-signature'];
  const timestamp = headers['x-webhook-timestamp'];
  const eventId = String(payload?.id ?? '');
  const eventType = String(payload?.event ?? headers['x-webhook-event'] ?? '');
  const environment = ((payload?.environment ??
    headers['x-webhook-environment'] ??
    resolveEnvironment()) as GatewayEnvironment satisfies GatewayEnvironment);

  if (!eventId || !eventType) {
    return reject(400, 'Missing event id or type');
  }

  // --- 1. Log first, so an event is auditable even if everything after fails.
  let eventRow: PaymentWebhookEvent;
  try {
    [eventRow] = await db
      .insert(paymentWebhookEvents)
      .values({
        provider: 'geniuspay',
        gatewayEventId: eventId,
        eventType,
        environment,
        payload,
        signatureValid: false,
        receivedFromIp: clientIp ?? null,
      })
      .returning();
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error;

    // --- 2. Idempotency. A replay of an event we already *finished* is a
    // no-op. One we logged but never processed — a transient re-fetch failure,
    // say — is retried on the same row, otherwise the unique constraint would
    // wedge that payment forever.
    const [existing] = await db
      .select()
      .from(paymentWebhookEvents)
      .where(
        and(
          eq(paymentWebhookEvents.provider, 'geniuspay'),
          eq(paymentWebhookEvents.gatewayEventId, eventId)
        )
      )
      .limit(1);

    if (!existing || existing.processedAt) {
      return ok('Duplicate event ignored');
    }
    eventRow = existing;
  }

  // --- 3. Freshness: an old signed body is a replay attempt.
  if (!GeniusPayClient.isTimestampFresh(timestamp ?? payload?.timestamp)) {
    await note(eventRow.id, 'timestamp_expired');
    return reject(400, 'Timestamp outside the accepted window');
  }

  // --- 4. Platform credentials. Unlike a per-tenant gateway, the secret that
  // signs these is ours, so it is fetched *before* any tenant is resolved —
  // nothing attacker-controlled selects the verification key.
  const credentials = await getPlatformCredentials(environment);
  if (!credentials) {
    await note(eventRow.id, 'credentials_not_found');
    return reject(503, 'Gateway credentials are not configured');
  }

  // --- 5. Signature.
  const signatureValid = GeniusPayClient.verifyWebhookSignature(
    signature,
    timestamp,
    rawBody,
    credentials.webhookSecret
  );

  if (!signatureValid) {
    await note(eventRow.id, 'invalid_signature');
    return reject(401, 'Invalid signature');
  }

  await db
    .update(paymentWebhookEvents)
    .set({ signatureValid: true, processingError: null })
    .where(eq(paymentWebhookEvents.id, eventRow.id));

  // --- 6. Resolve our own record from the gateway reference. This, not the
  // payload metadata, is what says which tenant gets credited.
  const reference = payload?.data?.reference;
  if (!reference) {
    await note(eventRow.id, 'missing_reference');
    return ok('No transaction reference in payload');
  }

  const [intent] = (await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.provider, 'geniuspay'),
        eq(paymentIntents.gatewayReference, String(reference))
      )
    )
    .limit(1)) as PaymentIntent[];

  if (!intent) {
    await note(eventRow.id, 'intent_not_found');
    return ok('No local payment matches this reference');
  }

  await db
    .update(paymentWebhookEvents)
    .set({ tenantId: intent.tenantId })
    .where(eq(paymentWebhookEvents.id, eventRow.id));

  const tdb = tenantDb(intent.tenantId);

  // --- 7. Re-fetch. A forged payload cannot survive this: the answer comes
  // from the gateway over our own authenticated connection.
  const client = new GeniusPayClient(
    credentials.apiKeyPublic,
    credentials.apiSecret,
    environment
  );

  let remote: GeniusPayPaymentData | undefined;
  try {
    const response = await client.getPayment(String(reference));
    remote = response.data;
    if (!response.success || !remote) {
      throw new Error(response.error?.message ?? 'Gateway returned no payment');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    await note(eventRow.id, `refetch_failed: ${message}`);
    // 502 rather than 200: this is transient, and the retry will find the row
    // unprocessed and pick up where it left off.
    return reject(502, 'Could not re-fetch the payment from GeniusPay');
  }

  // --- 8. The amount must agree three ways: payload, gateway, and what we
  // asked for. Comparing only the first two would let a payment for a
  // different sum settle an intent in full.
  const remoteAmount = Number(remote.amount);
  const payloadAmount = Number(payload?.data?.amount);

  if (Number.isFinite(payloadAmount) && payloadAmount !== remoteAmount) {
    await note(eventRow.id, 'payload_amount_mismatch');
    console.error(
      `[geniuspay] payload/gateway amount mismatch on ${reference}: ` +
        `${payloadAmount} vs ${remoteAmount}`
    );
    return ok('Payload amount disagrees with the gateway');
  }

  if (remoteAmount !== intent.amountXof) {
    await note(eventRow.id, 'amount_mismatch');
    console.error(
      `[geniuspay] settled amount differs from intent ${intent.id}: ` +
        `gateway ${remoteAmount}, intent ${intent.amountXof}`
    );
    return ok('Settled amount differs from the payment intent');
  }

  // --- 9. Business logic.
  try {
    if (eventType === 'payment.success') {
      // The event says success; the gateway's own status gets a veto. An
      // unrecognised status still credits — refusing on every word we have not
      // seen would turn a gateway vocabulary change into an outage — but a
      // status that explicitly means "not settled" never does.
      const remoteStatus = String(remote.status ?? '').toLowerCase();
      if (FAILED_GATEWAY_STATUSES.has(remoteStatus)) {
        await note(eventRow.id, `status_contradicts_event: ${remoteStatus}`);
        return ok('Gateway status contradicts the success event');
      }

      const { creditsGranted } = await settlePayment(tdb, {
        intent,
        eventId,
        gatewayStatus: remote.status,
        paymentMethod: remote.payment_method ?? null,
        feesXof: Number.isFinite(Number(remote.fees)) ? Number(remote.fees) : null,
        netXof: Number.isFinite(Number(remote.net_amount))
          ? Number(remote.net_amount)
          : null,
        completedAt: remote.completed_at ? new Date(remote.completed_at) : undefined,
      });

      await markProcessed(eventRow.id);
      return ok(`Payment settled, ${creditsGranted} credits granted`);
    }

    if (FAILURE_EVENTS.has(eventType)) {
      const status =
        eventType === 'payment.cancelled'
          ? 'cancelled'
          : eventType === 'payment.expired'
            ? 'expired'
            : 'failed';
      const reason = remote.failure_reason ?? `GeniusPay event: ${eventType}`;

      await tdb.update(
        paymentIntents,
        {
          status,
          gatewayStatus: remote.status ?? status,
          failedAt: new Date(),
          failureReason: reason,
          updatedAt: new Date(),
        },
        eq(paymentIntents.id, intent.id)
      );

      if (intent.kind === 'subscription' && intent.billingCycleId) {
        await markAttemptFailed(tdb, {
          billingCycleId: intent.billingCycleId,
          paymentAttemptId: intent.paymentAttemptId,
          reason,
        });
      }

      await markProcessed(eventRow.id);
      return ok(`Payment marked ${status}`);
    }

    if (eventType === 'payment.refunded') {
      const clawback = await clawBackRefund(tdb, intent, eventId);
      await markProcessed(eventRow.id);
      if (clawback.shortfall > 0) {
        // Recorded rather than forced: driving the balance negative would
        // break the invariant the whole ledger rests on. An operator settles
        // the remainder with a manual adjustment.
        await note(
          eventRow.id,
          `refund_shortfall: ${clawback.shortfall} credits already spent`
        );
      }
      return ok(`Refund recorded, ${clawback.reclaimed} credits reclaimed`);
    }

    await markProcessed(eventRow.id);
    return ok(`Event ${eventType} acknowledged with no action`);
  } catch (error) {
    const message =
      error instanceof BillingError || error instanceof Error
        ? error.message
        : 'unknown error';
    await note(eventRow.id, `processing_error: ${message}`);
    throw error;
  }
}

async function markProcessed(eventRowId: number) {
  await db
    .update(paymentWebhookEvents)
    .set({ processedAt: new Date(), processingError: null })
    .where(eq(paymentWebhookEvents.id, eventRowId));
}

/** Takes back what a refunded payment granted, as far as the balance allows. */
async function clawBackRefund(
  tdb: ReturnType<typeof tenantDb>,
  intent: PaymentIntent,
  eventId: string
): Promise<{ reclaimed: number; shortfall: number }> {
  return await tdb.transaction(async (tx) => {
    await tx.update(
      paymentIntents,
      { status: 'cancelled', updatedAt: new Date() },
      eq(paymentIntents.id, intent.id)
    );

    const balance = await getBalance(tx);
    const reclaimed = Math.min(intent.creditsGranted, balance);
    const shortfall = intent.creditsGranted - reclaimed;

    if (reclaimed > 0) {
      await debitCredits(tx, {
        amount: reclaimed,
        reason: 'manual_adjustment',
        idempotencyKey: `geniuspay:${eventId}:refund`,
      });
    }

    return { reclaimed, shortfall };
  });
}
