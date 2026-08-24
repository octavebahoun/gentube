import { createHmac } from 'node:crypto';
import type {
  CreatePaymentParams,
  CreatedPayment,
  GeniusPayClient,
  GeniusPayPayment,
} from '@/lib/payments/geniuspay';

/**
 * Doublures de test pour la passerelle GeniusPay.
 *
 * Le service de checkout comme le pipeline webhook acceptent un client
 * injectable, donc aucun test ne touche le réseau — et aucun test n'a besoin
 * des vraies clés dans l'environnement.
 */

export const TEST_WEBHOOK_SECRET = 'whsec_test_0123456789';

/** Un paiement tel que la passerelle le rapporterait sur `GET /payments/{ref}`. */
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
 * Un client factice. `onCreate` / `onFetch` permettent à un test de faire
 * échouer l'un ou l'autre appel, ou de répondre quelque chose en désaccord
 * avec le corps du webhook.
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

/** Construit le corps webhook que la passerelle poste pour un événement de paiement. */
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

/** Signe un corps comme le fait la passerelle : HMAC-SHA256 sur `<ts>.<body>`. */
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
