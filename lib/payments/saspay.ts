import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CURRENCY,
  PaymentError,
  PaymentNotConfiguredError,
  SIGNATURE_TOLERANCE_S,
  assertXofAmount,
  parseXof,
  read,
  type CallbackEvent,
  type CheckoutRequest,
  type OpenedCheckout,
  type PaymentGateway,
  type Settlement,
  type SettlementStatus,
} from './contract';

/**
 * SasPay — encaissement mobile money au Bénin.
 *
 * Contrat vérifié sur `https://docs.saspay.me` le 5 septembre 2026 :
 * `POST /checkout-sessions/` ouvre une page hébergée, `GET
 * /checkout-sessions/{id}/` la relit, `GET /payments/{id}/verify/` donne le
 * détail monétaire de la transaction qui en est née.
 *
 * **Ce qui a décidé de l'architecture.** Sa charge de rappel ne porte **aucun
 * identifiant venant de nous** — ni métadonnées, ni id de session, seulement
 * une `reference` de transaction qu'il a générée et que nous n'avons jamais
 * vue. On ne peut donc pas aller de son rappel à l'abonnement à créditer.
 *
 * D'où `callbackIdentifies = 'nothing'` : son rappel est un **réveil**, et
 * c'est `settle()` qui dit ce qui s'est passé, encaissement par encaissement.
 * Ce n'est pas un contournement — c'est la règle que le pipeline appliquait
 * déjà (« la passerelle fait autorité, jamais un corps de webhook »), poussée
 * jusqu'au bout.
 *
 * *Question ouverte chez eux :* si les `metadata` posées sur une session
 * remontaient dans le rappel de transaction, la liaison deviendrait directe et
 * le balayage disparaîtrait. Leur documentation ne le dit pas, donc on ne parie
 * pas dessus.
 */

const DEFAULT_BASE_URL = 'https://api.saspay.me/api/v1';

/**
 * Combien de fois une *lecture* est rejouee quand la connexion ne s'etablit
 * pas. Trois suffit : au-dela, ce n'est plus un incident reseau mais une
 * panne, et le reveil suivant reprendra le paiement de toute facon.
 */
const RELECTURES_RESEAU = 3;

/** Attente entre deux essais, multipliee par le numero d'essai. */
const ATTENTE_RESEAU_MS = 300;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Le Bénin, en ISO 3166-1 alpha-2 — ce que leur API attend dans `country`. */
const COUNTRY = 'BJ';

export type SasPayEnvironment = 'sandbox' | 'live';

export type SasPayConfig = {
  environment: SasPayEnvironment;
  /** `sk_test_…` en bac à sable, `sk_live_…` en production. */
  apiKey: string;
  /** Le secret du webhook, posé dans leur tableau de bord. */
  webhookSecret: string;
  baseUrl: string;
};

/** Les en-têtes qu'ils posent sur chaque rappel. */
const CALLBACK_HEADERS = {
  signature: 'x-webhook-signature',
  timestamp: 'x-webhook-timestamp',
  event: 'x-webhook-event',
} as const;

/**
 * Leurs états de transaction, ramenés au vocabulaire du contrat.
 *
 * `CANCELLED` est distingué de `FAILED` : un abandon du payeur n'est pas un
 * refus du réseau, et la relance ne se raconte pas pareil au client.
 */
function toStatus(raw: unknown): SettlementStatus {
  const value = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (value === 'SUCCESS') return 'paid';
  if (value === 'FAILED') return 'failed';
  if (value === 'CANCELLED') return 'cancelled';
  // Tout état inconnu reste en attente : un nom ajouté par le prestataire ne
  // doit pas transformer un paiement en cours en échec définitif.
  return 'pending';
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isFreshTimestamp(
  timestamp: string | null | undefined,
  { toleranceS = SIGNATURE_TOLERANCE_S, now = Date.now() } = {}
): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  return Math.abs(now / 1000 - seconds) <= toleranceS;
}

export class SasPayGateway implements PaymentGateway {
  readonly provider = 'saspay';
  /** Voir le commentaire de tête : sa charge ne porte rien qui vienne de nous. */
  readonly callbackIdentifies = 'nothing' as const;
  readonly callbackPath = '/api/webhooks/saspay';

  constructor(private readonly config: SasPayConfig) {}

  get environment(): SasPayEnvironment {
    return this.config.environment;
  }

  /**
   * Ouvre une page de paiement hébergée.
   *
   * Le montant part en chaîne décimale — c'est ce que leur schéma demande —
   * mais il entre ici en entier de francs, parce que c'est de l'argent et
   * qu'un flottant qui traîne finit en écart de caisse.
   *
   * `fee_charge_mode` n'est **pas** envoyé : leur défaut au Bénin est `ADD_ON`,
   * la commission de 3,25 % s'ajoutant à ce que le payeur règle. Le jour où on
   * choisit de l'absorber, c'est ici que ça se décide — et c'est une décision
   * de tarification, pas de code (`docs/etude-des-couts.md` §2.4).
   */
  async openCheckout(request: CheckoutRequest): Promise<OpenedCheckout> {
    const amount = assertXofAmount(request.amountXof);

    const session = await this.call<Record<string, unknown>>(
      '/checkout-sessions/',
      {
        method: 'POST',
        body: JSON.stringify({
          amount: `${amount}.00`,
          currency: CURRENCY,
          country: COUNTRY,
          description: request.description,
          customer_name: request.customer.name,
          customer_email: request.customer.email,
          ...(request.customer.phone
            ? { customer_phone: request.customer.phone }
            : {}),
          return_url: request.returnUrl,
          metadata: request.metadata ?? {},
        }),
      }
    );

    const reference = typeof session.id === 'string' ? session.id : null;
    const checkoutUrl =
      typeof session.checkout_url === 'string' ? session.checkout_url : null;

    /*
     * Une réponse sans URL est un échec quoi qu'elle prétende : il n'y a nulle
     * part où envoyer le payeur. La traiter comme un succès laisserait des
     * cycles « en attente » morts derrière elle.
     */
    if (!reference || !checkoutUrl) {
      throw new PaymentError(
        'SasPay accepted the session but returned no id or checkout URL.'
      );
    }

    return { reference, checkoutUrl };
  }

  /**
   * L'état réel d'un encaissement, en une ou deux lectures.
   *
   * La session porte le statut et, une fois payée, l'id de la transaction. Le
   * détail monétaire — commission comprise — vit sur la transaction, d'où la
   * seconde lecture. Elle n'a lieu que si une transaction existe : tant que le
   * payeur n'a rien validé, il n'y a rien à lire.
   */
  async settle(reference: string): Promise<Settlement> {
    const session = await this.call<Record<string, any>>(
      `/checkout-sessions/${encodeURIComponent(reference)}/`
    );

    const transactionId =
      typeof session.transaction === 'string' ? session.transaction : null;

    if (!transactionId) {
      return {
        status: toStatus(session.status),
        amountXof: parseXof(session.amount),
        currency: typeof session.currency === 'string' ? session.currency : null,
        feeXof: null,
        chargedXof: null,
        netXof: null,
        transactionId: null,
      };
    }

    const paiement = await this.call<Record<string, any>>(
      `/payments/${encodeURIComponent(transactionId)}/verify/`
    );

    /*
     * Les trois champs de commission ne sont **pas** trois commissions : c'est
     * une seule, detaillee. Verifie sur une transaction reelle le 5 septembre
     * 2026 — client_fee 163 = gateway_fee 88 + platform_fee 75, pour 5 000
     * demandes et 5 163 debites. Les additionner donnait 326, soit le double
     * du vrai cout, et faussait d'autant l'etude de marge.
     *
     * `amounts.fee` est la version que SasPay presente comme faisant foi ;
     * `client_fee` est la meme valeur, gardee en second recours au cas ou
     * l'objet `amounts` manquerait sur une reponse plus ancienne.
     */
    const montants = (paiement.amounts ?? {}) as Record<string, unknown>;
    const fee = parseXof(montants.fee) ?? parseXof(paiement.client_fee);

    return {
      status: toStatus(paiement.status),
      amountXof: parseXof(paiement.requested_amount) ?? parseXof(session.amount),
      currency: typeof paiement.currency === 'string' ? paiement.currency : null,
      feeXof: fee,
      chargedXof:
        parseXof(paiement.debited_amount) ?? parseXof(montants.charged),
      netXof: parseXof(paiement.net_amount) ?? parseXof(montants.net),
      transactionId,
    };
  }

  /**
   * Vérifie la signature d'un rappel.
   *
   * HMAC-SHA256 en hexadécimal minuscule sur `<horodatage>.<corps>` — la même
   * construction que GeniusPay, ce qui n'est pas un hasard : c'est le schéma
   * répandu. Le corps est celui reçu, brut : le parser puis le re-sérialiser
   * change les espaces et casse la vérification.
   */
  verifyCallback({
    headers,
    rawBody,
    now = Date.now(),
  }: {
    headers: Record<string, string>;
    rawBody: string;
    now?: number;
  }): boolean {
    const secret = this.config.webhookSecret;
    const timestamp = headers[CALLBACK_HEADERS.timestamp];
    const provided = headers[CALLBACK_HEADERS.signature];
    if (!timestamp || !provided || !secret) return false;
    if (!isFreshTimestamp(timestamp, { now })) return false;

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    return safeEqual(provided.toLowerCase(), expected);
  }

  /**
   * Lit un rappel déjà vérifié.
   *
   * `reference` reste `null` par construction : celle que porte la charge est
   * la leur, jamais la nôtre, et s'en servir pour retrouver un encaissement
   * ferait chercher une clé qui n'existe pas chez nous. Voir
   * `callbackIdentifies`.
   *
   * L'id d'événement est dérivé de la signature : ils n'en fournissent pas, et
   * la signature est stable pour un corps et un horodatage donnés — deux
   * livraisons du même événement tombent donc sur la même valeur, ce qui est
   * exactement ce que l'unicité en base demande.
   */
  readCallback(rawBody: string, headers: Record<string, string>): CallbackEvent {
    let charge: { event?: unknown; data?: Record<string, unknown> };
    try {
      charge = JSON.parse(rawBody);
    } catch {
      throw new PaymentError('SasPay callback body is not JSON.', { status: 400 });
    }

    const name =
      typeof charge.event === 'string'
        ? charge.event
        : (headers[CALLBACK_HEADERS.event] ?? '');
    if (!name) {
      throw new PaymentError('SasPay callback carries no event name.', {
        status: 400,
      });
    }

    const signature = headers[CALLBACK_HEADERS.signature] ?? '';
    const horodatage = headers[CALLBACK_HEADERS.timestamp] ?? '';

    return {
      name,
      status: toStatus(charge.data?.status),
      reference: null,
      eventId: signature ? `sig:${signature}` : `ts:${horodatage}:${name}`,
    };
  }

  /**
   * Lit les soldes du marchand : ne facture rien, prouve que les clés vivent.
   *
   * `/merchant-balances/` et non `/wallet/` — vérifié contre l'API réelle le
   * 5 septembre 2026. Un wallet par (marchand, pays), en lecture seule stricte :
   * les retraits et transferts ne passent pas par l'API, seulement par leur
   * tableau de bord.
   */
  async ping(): Promise<Record<string, unknown>> {
    return await this.call<Record<string, unknown>>('/merchant-balances/');
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const requete = () =>
      fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...init.headers,
        },
      });

    /*
     * Une panne de connexion n'est pas une reponse : `fetch` ne rejette que si
     * rien n'a abouti, donc la requete n'a jamais atteint SasPay et la rejouer
     * ne peut rien encaisser deux fois.
     *
     * Seules les lectures sont rejouees. Un POST rejete a pu, lui, partir et
     * voir seulement sa reponse se perdre : le rejouer creerait une seconde
     * session de checkout. Une lecture qui echoue coute un paiement non
     * credite ; une ecriture rejouee couterait un doublon.
     */
    const methode = (init.method ?? 'GET').toUpperCase();
    const tentatives = methode === 'GET' ? RELECTURES_RESEAU : 1;

    let reponse: Response | null = null;
    let derniere: unknown = null;

    for (let essai = 1; essai <= tentatives; essai += 1) {
      try {
        reponse = await requete();
        break;
      } catch (cause) {
        derniere = cause;
        if (essai < tentatives) await pause(ATTENTE_RESEAU_MS * essai);
      }
    }

    if (!reponse) {
      throw new PaymentError(`SasPay is unreachable: ${derniere}`, {
        status: 504,
      });
    }

    const texte = await reponse.text();
    let corps: any = null;
    try {
      corps = texte ? JSON.parse(texte) : null;
    } catch {
      corps = null;
    }

    if (!reponse.ok) {
      /*
       * Deux codes gardent leur sens propre : 401 dit que les clés sont
       * mauvaises — inutile de réessayer — et 429 qu'on a dépassé leurs 300
       * requêtes par minute, ce qui se rattrape en attendant. Les confondre
       * avec un 502 enverrait chercher un bug là où il faut corriger une clé
       * ou ralentir.
       */
      const propres = [400, 401, 403, 404, 409, 422, 429];
      const message =
        corps?.error?.message ?? corps?.message ?? texte.slice(0, 400);
      throw new PaymentError(`SasPay ${reponse.status}: ${message}`, {
        status: propres.includes(reponse.status) ? reponse.status : 502,
        code: corps?.error?.code ?? corps?.code,
      });
    }

    /*
     * Leur documentation décrit une enveloppe `{ success, data }` en
     * introduction, mais les exemples des routes de paiement rendent l'objet à
     * plat. On accepte les deux plutôt que de parier sur l'un — se tromper ici
     * rendrait `undefined` partout, en silence.
     */
    if (corps && typeof corps === 'object' && 'data' in corps && 'success' in corps) {
      if (corps.success === false) {
        throw new PaymentError(
          `SasPay refused ${path}: ${corps.error?.message ?? 'no reason given'}`,
          { code: corps.error?.code }
        );
      }
      return corps.data as T;
    }

    return corps as T;
  }
}

export function sasPayEnvironment(): SasPayEnvironment {
  return read('SASPAY_ENV') === 'live' ? 'live' : 'sandbox';
}

/**
 * La configuration, lue dans l'environnement.
 *
 * Les clés bac à sable et production coexistent sous leurs propres noms, et
 * `SASPAY_ENV` choisit — comme chez GeniusPay avant. Une seule paire de
 * variables aurait rendu une bascule silencieuse : rien ne distingue à l'œil
 * une clé de test d'une clé réelle, sauf son préfixe.
 */
export function sasPayConfig(): SasPayConfig {
  const environment = sasPayEnvironment();
  const prefixe = environment === 'live' ? 'SASPAY_LIVE' : 'SASPAY_SANDBOX';

  const apiKey = read(`${prefixe}_API_KEY`);
  if (!apiKey) throw new PaymentNotConfiguredError(`${prefixe}_API_KEY`);

  const webhookSecret = read(`${prefixe}_WEBHOOK_SECRET`);
  if (!webhookSecret) {
    throw new PaymentNotConfiguredError(`${prefixe}_WEBHOOK_SECRET`);
  }

  /*
   * Le préfixe de la clé dit l'environnement auquel elle appartient. Une clé
   * `sk_live_` posée sous `SASPAY_SANDBOX_` encaisserait de l'argent réel en
   * croyant tester ; l'inverse laisserait la production ne rien encaisser du
   * tout. Les deux se voient ici, avant le premier appel.
   */
  const attendu = environment === 'live' ? 'sk_live_' : 'sk_test_';
  if (!apiKey.startsWith(attendu)) {
    throw new PaymentNotConfiguredError(
      `${prefixe}_API_KEY (expected a ${attendu}… key for the ${environment} environment)`
    );
  }

  return {
    environment,
    apiKey,
    webhookSecret,
    baseUrl: (read('SASPAY_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
  };
}

export function isSasPayConfigured(): boolean {
  try {
    sasPayConfig();
    return true;
  } catch {
    return false;
  }
}

export function createSasPayGateway(): SasPayGateway {
  return new SasPayGateway(sasPayConfig());
}
