import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  billingCycles,
  creditLedger,
  paymentAttempts,
  paymentIntents,
  subscriptions,
} from '@/lib/db/schema';
import { getBalance } from '@/lib/credits';
import type { TenantDb } from '@/lib/db/tenant-db';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import { fakeGeniusPay } from '@/lib/test/geniuspay';
import { GeniusPayError } from '@/lib/payments/geniuspay';
import {
  BillingError,
  assertCanManageBilling,
  createSubscriptionCheckout,
  createTopupCheckout,
  getBillingOverview,
  getSubscription,
} from './checkout';
import {
  MAX_PAYMENT_ATTEMPTS,
  PLAN_OFFERS,
  TOPUP_PACKS_FOR_SALE,
  UnknownOfferError,
} from './plans';

afterAll(async () => {
  await closeDb();
});

const BASE_URL = 'https://app.test';

/** Un checkout dont l'appel passerelle échoue toujours. */
function refusingGateway() {
  return fakeGeniusPay({
    onCreate: async () => {
      throw new GeniusPayError('Gateway unavailable');
    },
  });
}

async function failingCheckout(tdb: TenantDb, plan = 'starter') {
  await expect(
    createSubscriptionCheckout(tdb, plan, {
      client: refusingGateway().client,
      baseUrl: BASE_URL,
    })
  ).rejects.toThrow(BillingError);
}

describe('subscription checkout', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates the rows a confirmation will be matched against, and charges nothing', async () => {
    const tdb = await createTenant('Alpha');
    const fake = fakeGeniusPay({ reference: 'GP-SUB-1' });

    const checkout = await createSubscriptionCheckout(tdb, 'pro', {
      client: fake.client,
      baseUrl: BASE_URL,
    });

    expect(checkout.checkoutUrl).toBe('https://geniuspay.ci/checkout/GP-SUB-1');
    expect(checkout.gatewayReference).toBe('GP-SUB-1');

    const intent = await tdb.findById(paymentIntents, checkout.intentId);
    expect(intent).toMatchObject({
      kind: 'subscription',
      plan: 'pro',
      status: 'pending',
      amountXof: PLAN_OFFERS.pro.priceXof,
      creditsGranted: PLAN_OFFERS.pro.monthlyCredits,
      gatewayReference: 'GP-SUB-1',
      billingCycleId: checkout.cycleId,
    });

    const cycle = await tdb.findById(billingCycles, checkout.cycleId!);
    expect(cycle).toMatchObject({
      plan: 'pro',
      status: 'pending',
      amountXof: PLAN_OFFERS.pro.priceXof,
      creditsGranted: PLAN_OFFERS.pro.monthlyCredits,
    });
    expect(cycle!.periodEnd.getTime()).toBeGreaterThan(
      cycle!.periodStart.getTime()
    );

    const attempt = await tdb.findById(paymentAttempts, checkout.attemptId!);
    expect(attempt).toMatchObject({
      attemptNumber: 1,
      status: 'pending',
      gatewayReference: 'GP-SUB-1',
      paymentIntentId: checkout.intentId,
    });

    // Rien n'est acheté tant que la passerelle ne l'a pas confirmé.
    expect(await getBalance(tdb)).toBe(0);
    expect(await tdb.count(creditLedger)).toBe(0);
  });

  it('leaves the tenant on its old plan until the payment confirms', async () => {
    const tdb = await createTenant('Alpha');

    await createSubscriptionCheckout(tdb, 'pro', {
      client: fakeGeniusPay().client,
      baseUrl: BASE_URL,
    });

    expect((await tdb.getTenant())!.plan).toBe('starter');
    expect(await getSubscription(tdb)).toMatchObject({
      plan: 'pro',
      status: 'pending',
      currentPeriodEnd: null,
    });
  });

  it('sends the amount, the return URLs and the ids the webhook will carry', async () => {
    const tdb = await createTenant('Alpha');
    const fake = fakeGeniusPay({ reference: 'GP-SUB-2' });

    const checkout = await createSubscriptionCheckout(tdb, 'starter', {
      client: fake.client,
      baseUrl: BASE_URL,
    });

    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]).toMatchObject({
      amountXof: PLAN_OFFERS.starter.priceXof,
      successUrl: `${BASE_URL}/dashboard/billing?payment=success&intent=${checkout.intentId}`,
      errorUrl: `${BASE_URL}/dashboard/billing?payment=failed&intent=${checkout.intentId}`,
      metadata: {
        kind: 'subscription',
        tenant_id: tdb.tenantId,
        intent_id: checkout.intentId,
        cycle_id: checkout.cycleId,
        attempt_id: checkout.attemptId,
        plan: 'starter',
      },
    });
  });

  it('refuses a plan that is not sold online, before writing anything', async () => {
    const tdb = await createTenant('Alpha');
    const fake = fakeGeniusPay();

    for (const plan of ['business', 'enterprise', undefined]) {
      await expect(
        createSubscriptionCheckout(tdb, plan, {
          client: fake.client,
          baseUrl: BASE_URL,
        })
      ).rejects.toThrow(UnknownOfferError);
    }

    expect(await tdb.count(paymentIntents)).toBe(0);
    expect(await tdb.count(subscriptions)).toBe(0);
    expect(fake.created).toHaveLength(0);
  });

  it('closes the intent and the attempt when the gateway refuses the call', async () => {
    const tdb = await createTenant('Alpha');

    await failingCheckout(tdb);

    const [intent] = await tdb.findMany(paymentIntents);
    expect(intent).toMatchObject({ status: 'failed' });
    expect(intent.failureReason).toContain('Gateway unavailable');

    const [attempt] = await tdb.findMany(paymentAttempts);
    expect(attempt).toMatchObject({ status: 'failed' });

    // La période est toujours impayée, donc son cycle reste ouvert pour une
    // nouvelle tentative.
    const [cycle] = await tdb.findMany(billingCycles);
    expect(cycle.status).toBe('pending');
  });

  it('piles retries of the same bill onto one cycle', async () => {
    const tdb = await createTenant('Alpha');

    await failingCheckout(tdb);
    const retry = await createSubscriptionCheckout(tdb, 'starter', {
      client: fakeGeniusPay({ reference: 'GP-SUB-RETRY' }).client,
      baseUrl: BASE_URL,
    });

    expect(await tdb.count(billingCycles)).toBe(1);
    const attempt = await tdb.findById(paymentAttempts, retry.attemptId!);
    expect(attempt!.attemptNumber).toBe(2);
    expect(attempt!.billingCycleId).toBe(retry.cycleId);
  });

  it('opens a fresh cycle once a cycle has burned its retries', async () => {
    const tdb = await createTenant('Alpha');

    for (let i = 0; i < MAX_PAYMENT_ATTEMPTS; i += 1) {
      await failingCheckout(tdb);
    }
    const [firstCycle] = await tdb.findMany(billingCycles);

    const fresh = await createSubscriptionCheckout(tdb, 'starter', {
      client: fakeGeniusPay({ reference: 'GP-SUB-FRESH' }).client,
      baseUrl: BASE_URL,
    });

    // Un tenant à court de réessais peut toujours payer pour revenir.
    expect(fresh.cycleId).not.toBe(firstCycle.id);
    expect(await tdb.count(billingCycles)).toBe(2);
  });
});

describe('top-up checkout', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates a standalone intent, with no cycle and no subscription', async () => {
    const tdb = await createTenant('Alpha');
    const pack = TOPUP_PACKS_FOR_SALE[0];
    const fake = fakeGeniusPay({ reference: 'GP-TOP-1' });

    const checkout = await createTopupCheckout(tdb, pack.id, {
      client: fake.client,
      baseUrl: BASE_URL,
    });

    const intent = await tdb.findById(paymentIntents, checkout.intentId);
    expect(intent).toMatchObject({
      kind: 'topup',
      status: 'pending',
      plan: null,
      billingCycleId: null,
      amountXof: pack.priceXof,
      creditsGranted: pack.credits,
    });
    expect(fake.created[0]).toMatchObject({
      amountXof: pack.priceXof,
      metadata: { kind: 'topup', tenant_id: tdb.tenantId, pack_id: pack.id },
    });

    expect(await tdb.count(subscriptions)).toBe(0);
    expect(await tdb.count(paymentAttempts)).toBe(0);
    expect(await getBalance(tdb)).toBe(0);
  });

  it('refuses an unknown pack', async () => {
    const tdb = await createTenant('Alpha');

    await expect(
      createTopupCheckout(tdb, 'topup-999', {
        client: fakeGeniusPay().client,
        baseUrl: BASE_URL,
      })
    ).rejects.toThrow(UnknownOfferError);
    expect(await tdb.count(paymentIntents)).toBe(0);
  });
});

describe('billing access', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('lets only an owner or an admin pay for the workspace', () => {
    expect(() => assertCanManageBilling({ role: 'owner' })).not.toThrow();
    expect(() => assertCanManageBilling({ role: 'admin' })).not.toThrow();

    try {
      assertCanManageBilling({ role: 'member' });
      throw new Error('expected a BillingError');
    } catch (error) {
      expect(error).toBeInstanceOf(BillingError);
      expect((error as BillingError).statusCode).toBe(403);
    }
  });

  it('keeps one tenant payments out of another billing page', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');

    const checkout = await createSubscriptionCheckout(alpha, 'starter', {
      client: fakeGeniusPay({ reference: 'GP-SUB-ALPHA' }).client,
      baseUrl: BASE_URL,
    });

    const alphaOverview = await getBillingOverview(alpha);
    const betaOverview = await getBillingOverview(beta);

    expect(alphaOverview.payments.map((p) => p.id)).toEqual([checkout.intentId]);
    expect(betaOverview.payments).toEqual([]);
    expect(betaOverview.subscription).toBeNull();
    expect(await beta.findById(paymentIntents, checkout.intentId)).toBeNull();
    expect(
      await beta.findMany(paymentIntents, eq(paymentIntents.id, checkout.intentId))
    ).toEqual([]);
  });
});
