import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/drizzle';
import {
  billingCycles,
  creditLedger,
  paymentAttempts,
  paymentIntents,
  paymentWebhookEvents,
} from '@/lib/db/schema';
import { getBalance } from '@/lib/credits';
import type { TenantDb } from '@/lib/db/tenant-db';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import {
  TEST_WEBHOOK_SECRET,
  fakeGeniusPay,
  gatewayPayment,
  signedWebhook,
  webhookPayload,
} from '@/lib/test/geniuspay';
import {
  GeniusPayError,
  type GeniusPayClient,
  type GeniusPayPayment,
} from '@/lib/payments/geniuspay';
import {
  createSubscriptionCheckout,
  createTopupCheckout,
  getSubscription,
} from './checkout';
import { MAX_PAYMENT_ATTEMPTS, PLAN_OFFERS, TOPUP_PACKS_FOR_SALE } from './plans';
import { processGeniusPayWebhook } from './webhook';

afterAll(async () => {
  await closeDb();
});

const BASE_URL = 'https://app.test';

/** Une passerelle qui rapporte le paiement comme réglé lors de la re-lecture. */
function paidGateway(overrides: Partial<GeniusPayPayment> = {}): GeniusPayClient {
  return fakeGeniusPay({
    onFetch: async (reference) => gatewayPayment({ reference, ...overrides }),
  }).client;
}

function deliver(
  payload: ReturnType<typeof webhookPayload>,
  { client = paidGateway() }: { client?: GeniusPayClient } = {}
) {
  const signed = signedWebhook(payload, { timestamp: payload.timestamp });
  return processGeniusPayWebhook(signed.headers, signed.rawBody, {
    client,
    webhookSecret: TEST_WEBHOOK_SECRET,
  });
}

function webhookRows() {
  return db.select().from(paymentWebhookEvents);
}

async function startSubscription(
  tdb: TenantDb,
  plan: string,
  reference: string
) {
  return await createSubscriptionCheckout(tdb, plan, {
    client: fakeGeniusPay({ reference }).client,
    baseUrl: BASE_URL,
  });
}

describe('confirmed payments', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('grants the plan allowance and switches the tenant plan', async () => {
    const tdb = await createTenant('Alpha');
    const checkout = await startSubscription(tdb, 'pro', 'GP-SUB-1');

    const result = await deliver(
      webhookPayload({ reference: 'GP-SUB-1', amount: PLAN_OFFERS.pro.priceXof }),
      { client: paidGateway({ amount: PLAN_OFFERS.pro.priceXof }) }
    );

    expect(result).toMatchObject({ status: 200, outcome: 'credited' });
    expect(await getBalance(tdb)).toBe(PLAN_OFFERS.pro.monthlyCredits);

    const [entry] = await tdb.findMany(creditLedger);
    expect(entry).toMatchObject({
      reason: 'subscription_grant',
      delta: PLAN_OFFERS.pro.monthlyCredits,
      // Clé sur le paiement, pas l'événement.
      idempotencyKey: 'geniuspay:payment:GP-SUB-1',
    });

    expect((await tdb.getTenant())!.plan).toBe('pro');

    const subscription = await getSubscription(tdb);
    expect(subscription).toMatchObject({ plan: 'pro', status: 'active' });
    expect(subscription!.currentPeriodEnd).not.toBeNull();

    const cycle = await tdb.findById(billingCycles, checkout.cycleId!);
    expect(cycle).toMatchObject({ status: 'paid' });
    expect(cycle!.paidAt).not.toBeNull();

    const attempt = await tdb.findById(paymentAttempts, checkout.attemptId!);
    expect(attempt!.status).toBe('succeeded');

    const intent = await tdb.findById(paymentIntents, checkout.intentId);
    expect(intent).toMatchObject({
      status: 'succeeded',
      gatewayStatus: 'success',
      paymentMethod: 'mobile_money',
      feesXof: 300,
    });
    expect(intent!.succeededAt).not.toBeNull();

    const [event] = await webhookRows();
    expect(event).toMatchObject({
      signatureValid: true,
      tenantId: tdb.tenantId,
      gatewayReference: 'GP-SUB-1',
      processingError: null,
    });
    expect(event.processedAt).not.toBeNull();
  });

  it('grants a top-up without touching the subscription', async () => {
    const tdb = await createTenant('Alpha');
    const pack = TOPUP_PACKS_FOR_SALE[0];
    await createTopupCheckout(tdb, pack.id, {
      client: fakeGeniusPay({ reference: 'GP-TOP-1' }).client,
      baseUrl: BASE_URL,
    });

    const result = await deliver(
      webhookPayload({ reference: 'GP-TOP-1', amount: pack.priceXof }),
      { client: paidGateway({ amount: pack.priceXof }) }
    );

    expect(result.outcome).toBe('credited');
    expect(await getBalance(tdb)).toBe(pack.credits);
    expect((await tdb.findMany(creditLedger))[0].reason).toBe('topup');
    expect(await getSubscription(tdb)).toBeNull();
    // Le tenant garde le plan qu'il avait : un top-up achète des crédits, pas
    // un palier.
    expect((await tdb.getTenant())!.plan).toBe('starter');
  });
});

describe('forged and replayed callbacks', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('writes nothing at all when the signature does not verify', async () => {
    const tdb = await createTenant('Alpha');
    const checkout = await startSubscription(tdb, 'starter', 'GP-SUB-1');
    const payload = webhookPayload({ reference: 'GP-SUB-1' });
    const signed = signedWebhook(payload, { timestamp: payload.timestamp });

    const forged = await processGeniusPayWebhook(
      { ...signed.headers, 'x-webhook-signature': 'a'.repeat(64) },
      signed.rawBody,
      { client: paidGateway(), webhookSecret: TEST_WEBHOOK_SECRET }
    );

    expect(forged).toMatchObject({ status: 401, outcome: 'invalid_signature' });
    // Le cahier des charges est explicite : une signature invalide ne laisse
    // aucune ligne derrière elle.
    expect(await webhookRows()).toEqual([]);
    expect(await getBalance(tdb)).toBe(0);
    expect((await tdb.findById(paymentIntents, checkout.intentId))!.status).toBe(
      'pending'
    );
  });

  it('refuses a callback signed with another secret', async () => {
    const tdb = await createTenant('Alpha');
    await startSubscription(tdb, 'starter', 'GP-SUB-1');
    const payload = webhookPayload({ reference: 'GP-SUB-1' });
    const signed = signedWebhook(payload, {
      secret: 'whsec_attacker',
      timestamp: payload.timestamp,
    });

    const result = await processGeniusPayWebhook(signed.headers, signed.rawBody, {
      client: paidGateway(),
      webhookSecret: TEST_WEBHOOK_SECRET,
    });

    expect(result).toMatchObject({ status: 401, outcome: 'invalid_signature' });
    expect(await getBalance(tdb)).toBe(0);
  });

  it('refuses a stale callback, signature or not', async () => {
    const tdb = await createTenant('Alpha');
    await startSubscription(tdb, 'starter', 'GP-SUB-1');

    const stale = Math.floor(Date.now() / 1000) - 3_600;
    const result = await deliver(
      webhookPayload({ reference: 'GP-SUB-1', timestamp: stale })
    );

    expect(result).toMatchObject({ status: 400, outcome: 'timestamp_expired' });
    expect(await webhookRows()).toEqual([]);
    expect(await getBalance(tdb)).toBe(0);
  });

  it('credits once when the same event is delivered twice', async () => {
    const tdb = await createTenant('Alpha');
    await startSubscription(tdb, 'starter', 'GP-SUB-1');
    const payload = webhookPayload({ reference: 'GP-SUB-1' });
    const signed = signedWebhook(payload, { timestamp: payload.timestamp });
    const options = {
      client: paidGateway(),
      webhookSecret: TEST_WEBHOOK_SECRET,
    };

    const first = await processGeniusPayWebhook(
      signed.headers,
      signed.rawBody,
      options
    );
    const replay = await processGeniusPayWebhook(
      signed.headers,
      signed.rawBody,
      options
    );

    expect(first.outcome).toBe('credited');
    expect(replay).toMatchObject({ status: 200, outcome: 'duplicate' });
    expect(await getBalance(tdb)).toBe(PLAN_OFFERS.starter.monthlyCredits);
    expect(await tdb.count(creditLedger)).toBe(1);
    expect(await webhookRows()).toHaveLength(1);
  });

  it('credits once when the same payment arrives under a new event id', async () => {
    const tdb = await createTenant('Alpha');
    await startSubscription(tdb, 'starter', 'GP-SUB-1');

    const first = await deliver(
      webhookPayload({ eventId: 'evt_1', reference: 'GP-SUB-1' })
    );
    const again = await deliver(
      webhookPayload({ eventId: 'evt_2', reference: 'GP-SUB-1' })
    );

    // Les deux événements sont légitimes ; c'est la clé du grand livre qui
    // empêche le double crédit.
    expect(first.outcome).toBe('credited');
    expect(again.outcome).toBe('credited');
    expect(await getBalance(tdb)).toBe(PLAN_OFFERS.starter.monthlyCredits);
    expect(await tdb.count(creditLedger)).toBe(1);
    expect(await webhookRows()).toHaveLength(2);
  });
});

describe('the gateway has the last word', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('credits nothing when the re-fetch does not report the payment as paid', async () => {
    const tdb = await createTenant('Alpha');
    const checkout = await startSubscription(tdb, 'starter', 'GP-SUB-1');

    const result = await deliver(webhookPayload({ reference: 'GP-SUB-1' }), {
      client: paidGateway({ status: 'pending' }),
    });

    expect(result).toMatchObject({
      status: 200,
      outcome: 'gateway_contradicts_webhook',
    });
    expect(await getBalance(tdb)).toBe(0);
    expect((await tdb.findById(paymentIntents, checkout.intentId))!.status).toBe(
      'pending'
    );

    const [event] = await webhookRows();
    expect(event.processingError).toContain('gateway_status_not_paid');
    expect(event.processedAt).toBeNull();
  });

  it('credits nothing when the settled amount differs from the intent', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const tdb = await createTenant('Alpha');
      await startSubscription(tdb, 'starter', 'GP-SUB-1');

      const result = await deliver(
        webhookPayload({
          reference: 'GP-SUB-1',
          // Le callback prétend le bon montant ; la passerelle dit le contraire.
          amount: PLAN_OFFERS.starter.priceXof,
        }),
        { client: paidGateway({ amount: 500 }) }
      );

      expect(result.outcome).toBe('amount_mismatch');
      expect(await getBalance(tdb)).toBe(0);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('credits nothing for a payment settled in another currency', async () => {
    const tdb = await createTenant('Alpha');
    await startSubscription(tdb, 'starter', 'GP-SUB-1');

    const result = await deliver(webhookPayload({ reference: 'GP-SUB-1' }), {
      client: paidGateway({ currency: 'EUR' }),
    });

    expect(result.outcome).toBe('currency_mismatch');
    expect(await getBalance(tdb)).toBe(0);
  });

  it('asks for a redelivery when the gateway cannot be re-read, then credits', async () => {
    const tdb = await createTenant('Alpha');
    await startSubscription(tdb, 'starter', 'GP-SUB-1');
    const payload = webhookPayload({ reference: 'GP-SUB-1' });

    const unreachable = fakeGeniusPay({
      onFetch: async () => {
        throw new GeniusPayError('connect ETIMEDOUT');
      },
    }).client;

    const first = await deliver(payload, { client: unreachable });
    expect(first).toMatchObject({ status: 502, outcome: 'refetch_failed' });
    expect(await getBalance(tdb)).toBe(0);

    const [event] = await webhookRows();
    expect(event.processedAt).toBeNull();
    expect(event.processingError).toContain('refetch_failed');

    // Un événement non traité peut repartir — c'est ce que le 502 a demandé.
    const retry = await deliver(payload, { client: paidGateway() });
    expect(retry.outcome).toBe('credited');
    expect(await getBalance(tdb)).toBe(PLAN_OFFERS.starter.monthlyCredits);
    expect(await tdb.count(creditLedger)).toBe(1);
  });

  it('acknowledges a reference it never issued, and credits no one', async () => {
    const tdb = await createTenant('Alpha');
    await startSubscription(tdb, 'starter', 'GP-SUB-1');

    const result = await deliver(webhookPayload({ reference: 'GP-UNKNOWN' }));

    expect(result).toMatchObject({ status: 200, outcome: 'unknown_reference' });
    expect(await getBalance(tdb)).toBe(0);

    const [event] = await webhookRows();
    expect(event.tenantId).toBeNull();
    expect(event.processingError).toBe('unknown_reference');
  });

  it('resolves the tenant from the reference, never from the metadata', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    await startSubscription(alpha, 'starter', 'GP-SUB-ALPHA');

    // Un appelant connaissant l'id de Beta ne peut pas y faire passer le
    // paiement d'Alpha.
    const result = await deliver(
      webhookPayload({
        reference: 'GP-SUB-ALPHA',
        metadata: { kind: 'subscription', tenant_id: beta.tenantId },
      })
    );

    expect(result.outcome).toBe('credited');
    expect(await getBalance(alpha)).toBe(PLAN_OFFERS.starter.monthlyCredits);
    expect(await getBalance(beta)).toBe(0);
    expect((await webhookRows())[0].tenantId).toBe(alpha.tenantId);
  });
});

describe('failed payments', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('records the failure and marks the subscription past due', async () => {
    const tdb = await createTenant('Alpha');
    const checkout = await startSubscription(tdb, 'starter', 'GP-SUB-1');

    const result = await deliver(
      webhookPayload({
        event: 'payment.failed',
        reference: 'GP-SUB-1',
        status: 'failed',
      }),
      { client: paidGateway({ status: 'failed' }) }
    );

    expect(result).toMatchObject({ status: 200, outcome: 'failed' });
    expect(await getBalance(tdb)).toBe(0);

    const intent = await tdb.findById(paymentIntents, checkout.intentId);
    expect(intent).toMatchObject({ status: 'failed' });
    expect(intent!.failureReason).toContain('payment.failed');
    expect(
      (await tdb.findById(paymentAttempts, checkout.attemptId!))!.status
    ).toBe('failed');
    expect((await getSubscription(tdb))!.status).toBe('past_due');
    // La période reste ouverte pour une nouvelle tentative.
    expect((await tdb.findById(billingCycles, checkout.cycleId!))!.status).toBe(
      'pending'
    );
  });

  it('suspends the subscription once the retries are exhausted', async () => {
    const tdb = await createTenant('Alpha', { credits: 500 });

    for (let attempt = 1; attempt <= MAX_PAYMENT_ATTEMPTS; attempt += 1) {
      const reference = `GP-FAIL-${attempt}`;
      await startSubscription(tdb, 'starter', reference);
      const result = await deliver(
        webhookPayload({
          eventId: `evt_fail_${attempt}`,
          event: 'payment.failed',
          reference,
          status: 'failed',
        }),
        { client: paidGateway({ status: 'failed' }) }
      );
      expect(result.outcome).toBe('failed');
    }

    expect((await getSubscription(tdb))!.status).toBe('suspended');
    const [cycle] = await tdb.findMany(billingCycles);
    expect(cycle.status).toBe('failed');
    // La suspension stoppe le renouvellement ; elle ne confisque jamais ce
    // qui a été acheté.
    expect(await getBalance(tdb)).toBe(500);
  });

  it('records a failed top-up, which has no cycle to close', async () => {
    const tdb = await createTenant('Alpha');
    const pack = TOPUP_PACKS_FOR_SALE[0];
    const checkout = await createTopupCheckout(tdb, pack.id, {
      client: fakeGeniusPay({ reference: 'GP-TOP-1' }).client,
      baseUrl: BASE_URL,
    });

    const result = await deliver(
      webhookPayload({
        event: 'payment.cancelled',
        reference: 'GP-TOP-1',
        amount: pack.priceXof,
        status: 'cancelled',
      }),
      { client: paidGateway({ amount: pack.priceXof, status: 'cancelled' }) }
    );

    expect(result.outcome).toBe('failed');
    expect((await tdb.findById(paymentIntents, checkout.intentId))!.status).toBe(
      'cancelled'
    );
    expect(await getBalance(tdb)).toBe(0);
    expect(await tdb.count(paymentAttempts)).toBe(0);
  });

  it('ignores a failure callback for a payment the gateway reports as paid', async () => {
    const tdb = await createTenant('Alpha');
    const checkout = await startSubscription(tdb, 'starter', 'GP-SUB-1');

    const result = await deliver(
      webhookPayload({
        event: 'payment.failed',
        reference: 'GP-SUB-1',
        status: 'failed',
      }),
      { client: paidGateway({ status: 'success' }) }
    );

    expect(result.outcome).toBe('gateway_contradicts_webhook');
    // Le marquer échoué ici bloquerait un tenant qui a réellement payé.
    expect((await tdb.findById(paymentIntents, checkout.intentId))!.status).toBe(
      'pending'
    );
    expect((await getSubscription(tdb))!.status).toBe('pending');
  });
});

describe('malformed requests', () => {
  beforeEach(async () => {
    await resetDb();
  });

  const options = { webhookSecret: TEST_WEBHOOK_SECRET };

  it('refuses a body that is not declared as JSON', async () => {
    const result = await processGeniusPayWebhook(
      { 'content-type': 'text/plain' },
      '{}',
      options
    );
    expect(result).toMatchObject({ status: 400, outcome: 'invalid_content_type' });
  });

  it('refuses a body that is not JSON', async () => {
    const result = await processGeniusPayWebhook(
      { 'content-type': 'application/json' },
      'not json',
      options
    );
    expect(result).toMatchObject({ status: 400, outcome: 'invalid_json' });
  });

  it('refuses an event with no id or no type', async () => {
    const result = await processGeniusPayWebhook(
      { 'content-type': 'application/json' },
      JSON.stringify({ event: 'payment.success', data: {} }),
      options
    );
    expect(result).toMatchObject({ status: 400, outcome: 'missing_event_fields' });
    expect(await webhookRows()).toEqual([]);
  });

  it('acknowledges an event type it does not act on', async () => {
    const tdb = await createTenant('Alpha');
    await startSubscription(tdb, 'starter', 'GP-SUB-1');

    const result = await deliver(
      webhookPayload({ event: 'payment.refunded', reference: 'GP-SUB-1' })
    );

    expect(result).toMatchObject({ status: 200, outcome: 'ignored' });
    expect(await getBalance(tdb)).toBe(0);
  });
});
