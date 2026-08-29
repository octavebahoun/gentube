import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GatewayEnvironment } from '@/lib/db/schema';

/**
 * GeniusPay Merchant API client (Mobile Money and card, XOF).
 *
 * Field names, headers and the signature scheme are taken from the integration
 * already running in production in `octavebahoun/contravo`
 * (`lib/payments/geniuspay/geniuspay-client.ts`), not guessed. Two of its
 * hard-won details are reproduced below and marked.
 */

export const GENIUSPAY_BASE_URL = 'https://geniuspay.ci/api/v1/merchant';

/** Seconds a webhook timestamp may lag before it is treated as a replay. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type GeniusPayCustomer = {
  name?: string;
  email?: string;
  phone?: string;
  country?: string;
};

export type InitiatePaymentParams = {
  /** Whole XOF. The franc has no minor unit and the gateway expects the same. */
  amount: number;
  currency?: string;
  description?: string;
  customer?: GeniusPayCustomer;
  successUrl?: string;
  errorUrl?: string;
  metadata?: Record<string, unknown>;
  paymentMethod?: string;
  gateway?: string;
  mmoProvider?: string;
};

export type GeniusPayPaymentData = {
  id: number;
  reference: string;
  amount: number;
  currency: string;
  fees?: number;
  net_amount?: number;
  status: string;
  checkout_url?: string;
  payment_url?: string;
  metadata?: Record<string, unknown>;
  environment: string;
  expires_at?: string;
  created_at?: string;
  completed_at?: string;
  failure_reason?: string;
  payment_method?: string;
  payment_provider?: string;
  customer?: GeniusPayCustomer;
};

export type GeniusPayPaymentResponse = {
  success: boolean;
  data?: GeniusPayPaymentData;
  error?: { code: string; message: string };
};

export type GeniusPayAccountResponse = {
  success: boolean;
  data?: {
    id: string | number;
    /** What the live API returns; the documentation calls it `business_name`. */
    name?: string;
    business_name?: string;
    email?: string;
    status?: string;
    /** The gateway's own word on which keys these are. */
    environment?: string;
    type?: string;
  };
  error?: { code: string; message: string };
};

export class GeniusPayError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'GeniusPayError';
  }
}

export class GeniusPayClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKeyPublic: string,
    private readonly apiSecret: string,
    private readonly environment: GatewayEnvironment = 'sandbox',
    baseUrl: string = GENIUSPAY_BASE_URL
  ) {
    // The URL is identical on both sides: the *keys* decide sandbox or live,
    // never this argument. Declaring `live` while holding sandbox keys used to
    // run real-looking payments in simulation with no sign of it, so a
    // disagreement is a startup error instead.
    const actual = apiKeyPublic.includes('sandbox')
      ? 'sandbox'
      : apiKeyPublic.includes('live')
        ? 'live'
        : null;

    if (actual && actual !== environment) {
      throw new GeniusPayError(
        `GeniusPay ${actual} keys used for a declared ${environment} environment. ` +
          'The sandbox is a property of the keys alone — fix both together.'
      );
    }

    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...init,
      headers: {
        'X-API-Key': this.apiKeyPublic,
        'X-API-Secret': this.apiSecret,
        'Content-Type': 'application/json',
        // Without this header the gateway answers a validation error with an
        // HTML page under HTTP 200 instead of a 422 JSON body, and the reason
        // for the refusal disappears behind "Unexpected token '<'".
        Accept: 'application/json',
        ...init.headers,
      },
    });

    const text = await response.text();

    if (!response.ok) {
      let message = `GeniusPay returned HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text) as GeniusPayPaymentResponse;
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // Body was not JSON; the status line is all we can report.
      }
      throw new GeniusPayError(message, response.status);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GeniusPayError('GeniusPay returned a non-JSON success body.');
    }
  }

  /** Opens a checkout. The returned `checkout_url` is where the payer goes. */
  async initiatePayment(
    params: InitiatePaymentParams
  ): Promise<GeniusPayPaymentResponse> {
    if (!Number.isInteger(params.amount) || params.amount <= 0) {
      throw new GeniusPayError(
        `Invalid amount: ${params.amount}. XOF amounts are positive integers.`
      );
    }

    const body: Record<string, unknown> = {
      amount: params.amount,
      currency: params.currency ?? 'XOF',
      description: params.description,
      customer: params.customer,
      success_url: params.successUrl,
      error_url: params.errorUrl,
      metadata: params.metadata ?? {},
    };

    if (params.paymentMethod) body.payment_method = params.paymentMethod;
    if (params.gateway) body.gateway = params.gateway;
    if (params.mmoProvider) body.mmo_provider = params.mmoProvider;

    return await this.request<GeniusPayPaymentResponse>('/payments', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Reads a payment back from the gateway. This is the call that decides
   * whether money moved — a webhook body never does.
   */
  async getPayment(reference: string): Promise<GeniusPayPaymentResponse> {
    return await this.request<GeniusPayPaymentResponse>(
      `/payments/${encodeURIComponent(reference)}`,
      { method: 'GET' }
    );
  }

  /**
   * Reads the merchant account behind the keys. The only harmless call that
   * proves a key pair works, so it doubles as the check run when credentials
   * are stored: nothing is charged, and the answer names the environment the
   * gateway itself considers active.
   */
  async getAccount(): Promise<GeniusPayAccountResponse> {
    return await this.request<GeniusPayAccountResponse>('/account', {
      method: 'GET',
    });
  }

  /**
   * HMAC-SHA256 over `<timestamp>.<raw body>`, hex, compared in constant time.
   *
   * The raw request body must be passed through byte for byte — re-serialising
   * the parsed JSON changes whitespace and invalidates the signature. The
   * compact-JSON second attempt exists because some senders sign the
   * re-serialised form; it is a fallback, never the first check.
   */
  static verifyWebhookSignature(
    signature: string | null | undefined,
    timestamp: string | null | undefined,
    rawBody: string,
    webhookSecret: string
  ): boolean {
    if (!signature || !timestamp) return false;

    const matches = (payload: string) => {
      const computed = createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');
      const expected = Buffer.from(computed, 'hex');
      const given = Buffer.from(signature, 'hex');
      if (expected.length === 0 || expected.length !== given.length) return false;
      return timingSafeEqual(expected, given);
    };

    if (matches(`${timestamp}.${rawBody}`)) return true;

    try {
      return matches(`${timestamp}.${JSON.stringify(JSON.parse(rawBody))}`);
    } catch {
      return false;
    }
  }

  /** Whether a webhook timestamp is recent enough to act on. */
  static isTimestampFresh(
    timestamp: string | number | null | undefined,
    nowMs: number = Date.now()
  ): boolean {
    const seconds = Number(timestamp);
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    return Math.abs(nowMs / 1000 - seconds) <= WEBHOOK_TOLERANCE_SECONDS;
  }
}
