import { createHmac } from 'node:crypto';
import { safeEqual } from '@/lib/crypto/encryption';
import {
  geniusPayConfig,
  type GeniusPayConfig,
  type GeniusPayEnvironment,
} from '@/lib/billing/config';
import { CURRENCY, assertXofAmount } from '@/lib/billing/plans';

/**
 * GeniusPay merchant API client (Mobile Money + card, XOF).
 *
 * Endpoints, headers and the signature format below are the ones the gateway
 * actually serves in production for Contravo — not guesses. Base URL:
 * `https://geniuspay.ci/api/v1/merchant`, keys in `X-API-Key` / `X-API-Secret`.
 */

/** Payment object as the gateway returns it, in `data`. */
export type GeniusPayPayment = {
  id?: number | string;
  reference: string;
  /** Whole XOF: the gateway reports amounts in the currency's normal unit. */
  amount: number;
  currency: string;
  status: string;
  fees?: number | null;
  net_amount?: number | null;
  checkout_url?: string | null;
  payment_url?: string | null;
  metadata?: Record<string, unknown> | null;
  environment?: string | null;
  payment_method?: string | null;
  payment_provider?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

export type GeniusPayEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

export type CreatePaymentParams = {
  amountXof: number;
  description: string;
  successUrl: string;
  errorUrl: string;
  metadata?: Record<string, unknown>;
  customer?: { name?: string; email?: string; phone?: string };
};

export type CreatedPayment = {
  payment: GeniusPayPayment;
  reference: string;
  checkoutUrl: string;
};

export class GeniusPayError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'GeniusPayError';
    this.status = options.status;
    this.code = options.code;
  }
}

/**
 * Statuses that mean the money actually arrived.
 *
 * Everything not in this set — `pending`, `processing`, an unknown word, an
 * absent status — is treated as *not paid*. That is the safe direction: the
 * worst case is a confirmation that arrives late, never a balance credited for
 * a payment that never settled. Confirm the exact vocabulary on the first
 * sandbox payment and extend this set if the gateway uses another word.
 */
const PAID_STATUSES = new Set([
  'success',
  'successful',
  'succeeded',
  'completed',
  'complete',
  'paid',
]);

export function isPaidStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && PAID_STATUSES.has(status.toLowerCase());
}

/** Webhook event names emitted by the gateway. */
export const PAYMENT_SUCCESS_EVENT = 'payment.success';
export const PAYMENT_FAILURE_EVENTS = [
  'payment.failed',
  'payment.cancelled',
  'payment.expired',
] as const;

export type PaymentFailureEvent = (typeof PAYMENT_FAILURE_EVENTS)[number];

export function isFailureEvent(event: string): event is PaymentFailureEvent {
  return (PAYMENT_FAILURE_EVENTS as readonly string[]).includes(event);
}

/** Webhook timestamps older than this are refused as replays. */
export const SIGNATURE_TOLERANCE_S = 300;

export class GeniusPayClient {
  private readonly config: GeniusPayConfig;

  constructor(config: GeniusPayConfig = geniusPayConfig()) {
    // The gateway decides sandbox vs live from the *key*, never from a flag we
    // send. A disagreement between the two is therefore a startup error, not a
    // warning: the alternative is real checkouts running in what everything
    // else calls simulation, with nothing on screen to show it.
    const keyEnvironment: GeniusPayEnvironment | null = config.apiKey.includes(
      'sandbox'
    )
      ? 'sandbox'
      : config.apiKey.includes('live')
        ? 'live'
        : null;

    if (keyEnvironment && keyEnvironment !== config.environment) {
      throw new GeniusPayError(
        `The configured API key is a ${keyEnvironment} key but GENIUS_ENV says ` +
          `${config.environment}. Only the key decides which one is real, so a ` +
          'live key under GENIUS_SANDBOX_API_KEY would charge real money in what ' +
          'the dashboard calls simulation. Fix both together.'
      );
    }

    this.config = config;
  }

  get environment(): GeniusPayEnvironment {
    return this.config.environment;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<GeniusPayEnvelope<T>> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        'X-API-Key': this.config.apiKey,
        'X-API-Secret': this.config.apiSecret,
        'Content-Type': 'application/json',
        // Without this the gateway answers a validation error with an HTML page
        // and HTTP 200, and the real reason disappears behind a JSON parse
        // error. Ask for JSON explicitly and a 422 comes back as a 422.
        Accept: 'application/json',
        ...init.headers,
      },
    });

    const text = await response.text();
    let envelope: GeniusPayEnvelope<T> | null = null;
    try {
      envelope = text ? (JSON.parse(text) as GeniusPayEnvelope<T>) : null;
    } catch {
      envelope = null;
    }

    if (!response.ok) {
      throw new GeniusPayError(
        envelope?.error?.message ??
          `GeniusPay returned HTTP ${response.status} for ${path}`,
        { status: response.status, code: envelope?.error?.code }
      );
    }

    if (!envelope) {
      throw new GeniusPayError(
        `GeniusPay returned a non-JSON body for ${path}`,
        { status: response.status }
      );
    }

    return envelope;
  }

  private unwrap<T>(envelope: GeniusPayEnvelope<T>, path: string): T {
    if (!envelope.success || !envelope.data) {
      throw new GeniusPayError(
        envelope.error?.message ?? `GeniusPay refused ${path}`,
        { code: envelope.error?.code }
      );
    }
    return envelope.data;
  }

  /** Opens a checkout. Returns the URL to send the payer to. */
  async createPayment(params: CreatePaymentParams): Promise<CreatedPayment> {
    const amount = assertXofAmount(params.amountXof);

    const envelope = await this.request<GeniusPayPayment>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        currency: CURRENCY,
        description: params.description,
        success_url: params.successUrl,
        error_url: params.errorUrl,
        customer: params.customer,
        metadata: params.metadata ?? {},
      }),
    });

    const payment = this.unwrap(envelope, 'POST /payments');
    const checkoutUrl = payment.checkout_url || payment.payment_url;

    // A response with no URL is a failure whatever `success` claims: there is
    // nowhere to send the payer. Treating it as success left dead "pending"
    // cycles behind in Contravo.
    if (!payment.reference || !checkoutUrl) {
      throw new GeniusPayError(
        'GeniusPay accepted the payment but returned no reference or checkout URL.'
      );
    }

    return { payment, reference: payment.reference, checkoutUrl };
  }

  /**
   * Re-reads a payment from the gateway. This is the authority on whether money
   * moved — a webhook body never is.
   */
  async fetchPayment(reference: string): Promise<GeniusPayPayment> {
    const envelope = await this.request<GeniusPayPayment>(
      `/payments/${encodeURIComponent(reference)}`
    );
    return this.unwrap(envelope, `GET /payments/${reference}`);
  }

  /**
   * Reads the merchant account behind the keys. Charges nothing, so it is the
   * harmless call that proves a key pair works — and the gateway's own word on
   * which environment those keys belong to.
   */
  async getAccount(): Promise<Record<string, unknown>> {
    const envelope = await this.request<Record<string, unknown>>('/account');
    return this.unwrap(envelope, 'GET /account');
  }
}

/** Client built from the environment. Throws if billing is not configured. */
export function createGeniusPayClient(): GeniusPayClient {
  return new GeniusPayClient(geniusPayConfig());
}

/**
 * Verifies an inbound webhook signature: HMAC-SHA256 over
 * `<timestamp>.<raw body>`, hex, compared in constant time.
 *
 * The raw body is the one the gateway signed, so it is the one hashed here.
 * The compact-JSON fallback covers a gateway that signs a re-serialised body —
 * a compatibility path Contravo needed in production. It cannot weaken the
 * result: both forms are HMACs under the same secret, and nothing is credited
 * on a signature alone anyway (the re-fetch decides).
 */
export function verifyWebhookSignature({
  signature,
  timestamp,
  rawBody,
  secret,
}: {
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  rawBody: string;
  secret: string;
}): boolean {
  if (!signature || !timestamp) return false;

  const provided = signature.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(provided)) return false;

  const digest = (body: string) =>
    createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

  if (safeEqual(digest(rawBody), provided)) return true;

  try {
    return safeEqual(digest(JSON.stringify(JSON.parse(rawBody))), provided);
  } catch {
    return false;
  }
}

/**
 * Rejects a stale or future-dated webhook — the cheap half of replay
 * protection, the other half being the unique event id.
 *
 * Seconds since epoch is what the gateway sends; a millisecond value is
 * accepted too rather than being read as the year 48000.
 */
export function isFreshTimestamp(
  timestamp: string | number | null | undefined,
  { toleranceS = SIGNATURE_TOLERANCE_S, now = Date.now() } = {}
): boolean {
  const raw = Number(timestamp);
  if (!Number.isFinite(raw) || raw <= 0) return false;

  const seconds = raw >= 1e12 ? raw / 1000 : raw;
  return Math.abs(now / 1000 - seconds) <= toleranceS;
}
