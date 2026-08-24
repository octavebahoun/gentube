import { createHmac } from 'node:crypto';
import type {
  CreatePaymentParams,
  CreatedPayment,
  GeniusPayClient,
  GeniusPayPayment,
} from '@/lib/payments/geniuspay';

/**
 * Test doubles for the GeniusPay gateway.
 *
 * Both the checkout service and the webhook pipeline take an injectable
 * client, so no test ever touches the network — and no test needs the real
 * keys in the environment.
 */

export const TEST_WEBHOOK_SECRET = 'whsec_test_0123456789';

/** A payment as the gateway would report it on `GET /payments/{ref}`. */
export function gatewayPayment(
  overrides: Partial<GeniusPayPayment> = {}
): GeniusPayPayment {
  return {
    id: 1,
    reference: 'GP-REF-1',
    amount: 15_000,
    currency: 'XOF',
    status: 'success',
    fees: 300,
    net_amount: 14_700,
    payment_method: 'mobile_money',
    environment: 'sandbox',
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

export type FakeGeniusPay = {
  client: GeniusPayClient;
  created: CreatePaymentParams[];
  fetched: string[];
};

/**
 * A stub client. `onCreate` / `onFetch` let a test make either call fail or
 * answer something the webhook body disagrees with.
 */
export function fakeGeniusPay({
  reference = 'GP-REF-1',
  checkoutUrl,
  onCreate,
  onFetch,
}: {
  reference?: string;
  checkoutUrl?: string;
  onCreate?: (params: CreatePaymentParams) => Promise<CreatedPayment>;
  onFetch?: (reference: string) => Promise<GeniusPayPayment>;
} = {}): FakeGeniusPay {
  const created: CreatePaymentParams[] = [];
  const fetched: string[] = [];

  const client = {
    environment: 'sandbox' as const,

    async createPayment(params: CreatePaymentParams): Promise<CreatedPayment> {
      created.push(params);
      if (onCreate) return await onCreate(params);
      const payment = gatewayPayment({
        reference,
        amount: params.amountXof,
        status: 'pending',
      });
      return {
        payment,
        reference,
        checkoutUrl: checkoutUrl ?? `https://geniuspay.ci/checkout/${reference}`,
      };
    },

    async fetchPayment(ref: string): Promise<GeniusPayPayment> {
      fetched.push(ref);
      if (onFetch) return await onFetch(ref);
      return gatewayPayment({ reference: ref });
    },
  } as unknown as GeniusPayClient;

  return { client, created, fetched };
}

/** Builds the webhook body the gateway posts for a payment event. */
export function webhookPayload({
  eventId = 'evt_1',
  event = 'payment.success',
  reference = 'GP-REF-1',
  amount = 15_000,
  currency = 'XOF',
  status = 'success',
  metadata = {},
  timestamp = Math.floor(Date.now() / 1000),
}: {
  eventId?: string;
  event?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
} = {}) {
  return {
    id: eventId,
    event,
    environment: 'sandbox',
    timestamp,
    data: { reference, amount, currency, status, metadata },
  };
}

/** Signs a body the way the gateway does: HMAC-SHA256 over `<ts>.<body>`. */
export function signedWebhook(
  payload: unknown,
  {
    secret = TEST_WEBHOOK_SECRET,
    timestamp = Math.floor(Date.now() / 1000),
    rawBody,
  }: { secret?: string; timestamp?: number; rawBody?: string } = {}
): { headers: Record<string, string>; rawBody: string } {
  const body = rawBody ?? JSON.stringify(payload);
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  return {
    rawBody: body,
    headers: {
      'content-type': 'application/json',
      'x-webhook-signature': signature,
      'x-webhook-timestamp': String(timestamp),
      'x-webhook-event': String((payload as { event?: string })?.event ?? ''),
    },
  };
}
