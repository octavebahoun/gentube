import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidAmountError } from '@/lib/billing/plans';
import type { GeniusPayConfig } from '@/lib/billing/config';
import {
  GeniusPayClient,
  GeniusPayError,
  isFailureEvent,
  isFreshTimestamp,
  isPaidStatus,
  verifyWebhookSignature,
} from './geniuspay';

const SECRET = 'whsec_test_0123456789';

function config(overrides: Partial<GeniusPayConfig> = {}): GeniusPayConfig {
  return {
    apiKey: 'pk_sandbox_abc',
    apiSecret: 'sk_sandbox_abc',
    webhookSecret: SECRET,
    environment: 'sandbox',
    baseUrl: 'https://geniuspay.test/api/v1/merchant',
    ...overrides,
  };
}

function sign(body: string, timestamp: number | string, secret = SECRET) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Met en file une réponse JSON pour le prochain appel fetch. */
function stubFetch(
  body: unknown,
  { status = 200, raw }: { status?: number; raw?: string } = {}
) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(raw ?? JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('webhook signature', () => {
  const body = JSON.stringify({ id: 'evt_1', event: 'payment.success' });
  const timestamp = Math.floor(Date.now() / 1000);

  it('accepts the signature the gateway computes', () => {
    expect(
      verifyWebhookSignature({
        signature: sign(body, timestamp),
        timestamp: String(timestamp),
        rawBody: body,
        secret: SECRET,
      })
    ).toBe(true);
  });

  it('accepts an uppercase or sha256-prefixed digest', () => {
    const signature = sign(body, timestamp);
    for (const variant of [signature.toUpperCase(), `sha256=${signature}`]) {
      expect(
        verifyWebhookSignature({
          signature: variant,
          timestamp: String(timestamp),
          rawBody: body,
          secret: SECRET,
        })
      ).toBe(true);
    }
  });

  it('refuses another secret, a tampered body or a moved timestamp', () => {
    const signature = sign(body, timestamp);

    expect(
      verifyWebhookSignature({
        signature,
        timestamp: String(timestamp),
        rawBody: body,
        secret: 'whsec_other',
      })
    ).toBe(false);

    expect(
      verifyWebhookSignature({
        signature,
        timestamp: String(timestamp),
        rawBody: body.replace('payment.success', 'payment.failed'),
        secret: SECRET,
      })
    ).toBe(false);

    expect(
      verifyWebhookSignature({
        signature,
        timestamp: String(timestamp + 1),
        rawBody: body,
        secret: SECRET,
      })
    ).toBe(false);
  });

  it('refuses a missing or malformed signature without throwing', () => {
    const base = { timestamp: String(timestamp), rawBody: body, secret: SECRET };
    expect(verifyWebhookSignature({ ...base, signature: null })).toBe(false);
    expect(verifyWebhookSignature({ ...base, signature: '' })).toBe(false);
    expect(verifyWebhookSignature({ ...base, signature: 'not-hex!' })).toBe(false);
    expect(
      verifyWebhookSignature({
        signature: sign(body, timestamp),
        timestamp: null,
        rawBody: body,
        secret: SECRET,
      })
    ).toBe(false);
  });

  it('accepts a digest computed over the compact form of the same body', () => {
    // Chemin de compatibilité : une passerelle qui signe un corps re-sérialisé.
    // Les octets diffèrent, pas le JSON.
    const spaced = `{\n  "id": "evt_1",\n  "event": "payment.success"\n}`;
    const compact = JSON.stringify(JSON.parse(spaced));
    expect(spaced).not.toBe(compact);

    expect(
      verifyWebhookSignature({
        signature: sign(compact, timestamp),
        timestamp: String(timestamp),
        rawBody: spaced,
        secret: SECRET,
      })
    ).toBe(true);
  });
});

describe('timestamp freshness', () => {
  const now = 1_800_000_000_000;

  it('accepts a timestamp inside the tolerance, in seconds or milliseconds', () => {
    expect(isFreshTimestamp(now / 1000, { now })).toBe(true);
    expect(isFreshTimestamp(String(now / 1000 - 299), { now })).toBe(true);
    expect(isFreshTimestamp(now, { now })).toBe(true);
  });

  it('refuses a replay, a future date or a junk value', () => {
    expect(isFreshTimestamp(now / 1000 - 301, { now })).toBe(false);
    expect(isFreshTimestamp(now / 1000 + 601, { now })).toBe(false);
    expect(isFreshTimestamp(undefined, { now })).toBe(false);
    expect(isFreshTimestamp('yesterday', { now })).toBe(false);
    expect(isFreshTimestamp(0, { now })).toBe(false);
  });
});

describe('gateway vocabulary', () => {
  it('treats only settled statuses as paid', () => {
    for (const status of ['success', 'SUCCEEDED', 'completed', 'paid']) {
      expect(isPaidStatus(status)).toBe(true);
    }
    // Tout le reste est « pas encore payé » — la direction qui ne crédite jamais.
    for (const status of ['pending', 'processing', 'failed', '', null, undefined]) {
      expect(isPaidStatus(status)).toBe(false);
    }
  });

  it('knows which events close a payment', () => {
    expect(isFailureEvent('payment.failed')).toBe(true);
    expect(isFailureEvent('payment.cancelled')).toBe(true);
    expect(isFailureEvent('payment.expired')).toBe(true);
    expect(isFailureEvent('payment.success')).toBe(false);
  });
});

describe('GeniusPayClient', () => {
  it('refuses keys that disagree with the declared environment', () => {
    // Seule la clé décide laquelle est réelle ; un désaccord ferait tourner
    // des paiements live pendant que le dashboard prétend être en sandbox.
    expect(() => new GeniusPayClient(config({ apiKey: 'pk_live_abc' }))).toThrow(
      GeniusPayError
    );
    expect(
      () =>
        new GeniusPayClient(
          config({ apiKey: 'pk_sandbox_abc', environment: 'live' })
        )
    ).toThrow(GeniusPayError);
    expect(
      () => new GeniusPayClient(config({ apiKey: 'pk_live_abc', environment: 'live' }))
    ).not.toThrow();
  });

  it('opens a checkout with authenticated headers and an integer XOF amount', async () => {
    const fetchMock = stubFetch({
      success: true,
      data: {
        reference: 'GP-1',
        amount: 15_000,
        currency: 'XOF',
        status: 'pending',
        checkout_url: 'https://geniuspay.test/checkout/GP-1',
      },
    });

    const created = await new GeniusPayClient(config()).createPayment({
      amountXof: 15_000,
      description: 'GenTube — abonnement Starter',
      successUrl: 'https://app.test/ok',
      errorUrl: 'https://app.test/ko',
      metadata: { tenant_id: 7 },
    });

    expect(created.reference).toBe('GP-1');
    expect(created.checkoutUrl).toBe('https://geniuspay.test/checkout/GP-1');

    const [url, init] = fetchMock.mock.calls[0];
    if (!init) throw new Error('fetch was called without options');
    expect(url).toBe('https://geniuspay.test/api/v1/merchant/payments');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'X-API-Key': 'pk_sandbox_abc',
      'X-API-Secret': 'sk_sandbox_abc',
      Accept: 'application/json',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      amount: 15_000,
      currency: 'XOF',
      success_url: 'https://app.test/ok',
      error_url: 'https://app.test/ko',
      metadata: { tenant_id: 7 },
    });
  });

  it('refuses to send a fractional amount', async () => {
    const fetchMock = stubFetch({ success: true, data: {} });
    await expect(
      new GeniusPayClient(config()).createPayment({
        amountXof: 15_000.5,
        description: 'x',
        successUrl: 'https://app.test/ok',
        errorUrl: 'https://app.test/ko',
      })
    ).rejects.toThrow(InvalidAmountError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a response with no checkout URL as a failure', async () => {
    // `success: true` sans nulle part où envoyer le payeur a laissé des
    // utilisateurs de Contravo sur une page qui se rechargeait en boucle.
    stubFetch({
      success: true,
      data: { reference: 'GP-2', amount: 15_000, currency: 'XOF', status: 'pending' },
    });

    await expect(
      new GeniusPayClient(config()).createPayment({
        amountXof: 15_000,
        description: 'x',
        successUrl: 'https://app.test/ok',
        errorUrl: 'https://app.test/ko',
      })
    ).rejects.toThrow(GeniusPayError);
  });

  it('surfaces the gateway error message on a rejected call', async () => {
    stubFetch(
      { success: false, error: { code: 'invalid_amount', message: 'Amount too low' } },
      { status: 422 }
    );

    await expect(
      new GeniusPayClient(config()).fetchPayment('GP-3')
    ).rejects.toThrow('Amount too low');
  });

  it('reports an HTML answer as an error instead of a parse crash', async () => {
    stubFetch(null, { status: 200, raw: '<html>Whoops</html>' });

    await expect(
      new GeniusPayClient(config()).fetchPayment('GP-4')
    ).rejects.toThrow(GeniusPayError);
  });

  it('re-reads a payment by reference', async () => {
    const fetchMock = stubFetch({
      success: true,
      data: { reference: 'GP 5/6', amount: 15_000, currency: 'XOF', status: 'success' },
    });

    const payment = await new GeniusPayClient(config()).fetchPayment('GP 5/6');
    expect(payment.status).toBe('success');
    // La référence est encodée dans le chemin, pas interpolée brute.
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://geniuspay.test/api/v1/merchant/payments/GP%205%2F6'
    );
  });
});
