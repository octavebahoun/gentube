import { createHmac } from 'node:crypto';
import { safeEqual } from '@/lib/crypto/encryption';
import {
  geniusPayConfig,
  type GeniusPayConfig,
  type GeniusPayEnvironment,
} from '@/lib/billing/config';
import { CURRENCY, assertXofAmount } from '@/lib/billing/plans';

/**
 * Client de l'API marchande GeniusPay (Mobile Money + carte, XOF).
 *
 * Les endpoints, en-têtes et le format de signature ci-dessous sont ceux que
 * la passerelle sert réellement en production pour Contravo — pas des
 * conjectures. URL de base : `https://geniuspay.ci/api/v1/merchant`, clés dans
 * `X-API-Key` / `X-API-Secret`.
 */

/** Objet paiement tel que la passerelle le renvoie, dans `data`. */
export type GeniusPayPayment = {
  id?: number | string;
  reference: string;
  /** XOF entier : la passerelle rapporte les montants dans l'unité normale de la devise. */
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
 * Statuts qui signifient que l'argent est réellement arrivé.
 *
 * Tout ce qui n'est pas dans cet ensemble — `pending`, `processing`, un mot
 * inconnu, un statut absent — est traité comme *non payé*. C'est le sens sûr :
 * le pire cas est une confirmation qui arrive en retard, jamais un solde
 * crédité pour un paiement qui ne s'est jamais réglé. Confirmer le vocabulaire
 * exact au premier paiement sandbox et étendre cet ensemble si la passerelle
 * utilise un autre mot.
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

/** Noms d'événements webhook émis par la passerelle. */
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

/** Les horodatages webhook plus vieux que ceci sont refusés comme replays. */
export const SIGNATURE_TOLERANCE_S = 300;

export class GeniusPayClient {
  private readonly config: GeniusPayConfig;

  constructor(config: GeniusPayConfig = geniusPayConfig()) {
    // La passerelle décide sandbox vs live à partir de la *clé*, jamais d'un
    // flag que nous envoyons. Un désaccord entre les deux est donc une erreur
    // de démarrage, pas un avertissement : l'alternative serait de vrais
    // checkouts tournant dans ce que tout le reste appelle une simulation,
    // sans rien à l'écran pour le montrer.
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
        // Sans ceci la passerelle répond à une erreur de validation par une
        // page HTML et un HTTP 200, et la vraie raison disparaît derrière une
        // erreur de parse JSON. Demander JSON explicitement et un 422 revient
        // comme un 422.
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

  /** Ouvre un checkout. Renvoie l'URL vers laquelle envoyer le payeur. */
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

    // Une réponse sans URL est un échec quoi que prétende `success` : il n'y a
    // nulle part où envoyer le payeur. La traiter comme un succès laissait des
    // cycles « pending » morts derrière elle dans Contravo.
    if (!payment.reference || !checkoutUrl) {
      throw new GeniusPayError(
        'GeniusPay accepted the payment but returned no reference or checkout URL.'
      );
    }

    return { payment, reference: payment.reference, checkoutUrl };
  }

  /**
   * Re-lit un paiement auprès de la passerelle. C'est elle qui fait autorité
   * sur le fait que de l'argent a bougé — jamais un corps de webhook.
   */
  async fetchPayment(reference: string): Promise<GeniusPayPayment> {
    const envelope = await this.request<GeniusPayPayment>(
      `/payments/${encodeURIComponent(reference)}`
    );
    return this.unwrap(envelope, `GET /payments/${reference}`);
  }

  /**
   * Lit le compte marchand derrière les clés. Ne facture rien, donc c'est
   * l'appel inoffensif qui prouve qu'une paire de clés fonctionne — et le mot
   * propre de la passerelle sur l'environnement auquel ces clés appartiennent.
   */
  async getAccount(): Promise<Record<string, unknown>> {
    const envelope = await this.request<Record<string, unknown>>('/account');
    return this.unwrap(envelope, 'GET /account');
  }
}

/** Client construit depuis l'environnement. Lève si la facturation n'est pas configurée. */
export function createGeniusPayClient(): GeniusPayClient {
  return new GeniusPayClient(geniusPayConfig());
}

/**
 * Vérifie la signature d'un webhook entrant : HMAC-SHA256 sur
 * `<timestamp>.<corps brut>`, hexadécimal, comparé en temps constant.
 *
 * Le corps brut est celui que la passerelle a signé, donc c'est celui haché
 * ici. Le repli JSON compact couvre une passerelle qui signe un corps
 * re-sérialisé — un chemin de compatibilité dont Contravo a eu besoin en
 * production. Il ne peut pas affaiblir le résultat : les deux formes sont des
 * HMAC sous le même secret, et de toute façon rien n'est crédité sur une
 * seule signature (la re-lecture décide).
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
 * Rejette un webhook périmé ou daté du futur — la moitié bon marché de la
 * protection anti-replay, l'autre moitié étant l'id d'événement unique.
 *
 * Des secondes depuis l'époque est ce que la passerelle envoie ; une valeur
 * en millisecondes est acceptée aussi plutôt que d'être lue comme l'an 48000.
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
