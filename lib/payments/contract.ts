/**
 * Ce que l'encaissement attend d'un prestataire de paiement, et rien de plus.
 *
 * Le contrat vit à part des implémentations pour la même raison que ceux de la
 * voix et de la vidéo : il y aura plusieurs prestataires derrière, et le métier
 * ne doit jamais savoir lequel a répondu.
 *
 * **Une règle domine tout ce fichier :** la passerelle fait autorité sur le
 * fait que de l'argent a bougé, **jamais un corps de webhook**. Un rappel dit
 * « va voir » ; c'est `settle()` qui dit ce qui s'est passé. Cette règle était
 * déjà celle du pipeline GeniusPay ; elle devient ici une propriété du contrat,
 * parce qu'un prestataire dont le rappel ne porte aucun identifiant à nous la
 * rend obligatoire au lieu de simplement prudente.
 */

/** XOF n'a pas de sous-unité : les montants sont des entiers de francs. */
export const CURRENCY = 'XOF';

export type CheckoutRequest = {
  /** Entier de francs CFA. Jamais un flottant : c'est de l'argent. */
  amountXof: number;
  description: string;
  /** Où renvoyer le payeur quand il a fini, quoi qu'il ait fait. */
  returnUrl: string;
  customer: { name: string; email: string; phone?: string };
  /** Ce qu'on aimerait retrouver plus tard. Voir `callbackIdentifies`. */
  metadata?: Record<string, unknown>;
};

export type OpenedCheckout = {
  /**
   * Ce qu'on stocke dans `payment_intents.gateway_reference` pour retrouver
   * l'encaissement. C'est la clé que `settle()` reprendra — chez un
   * prestataire ce sera une référence de paiement, chez un autre l'id d'une
   * session hébergée.
   */
  reference: string;
  /** Où envoyer le payeur. Une réponse sans URL est un échec, quoi qu'elle dise. */
  checkoutUrl: string;
};

export type SettlementStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export type Settlement = {
  status: SettlementStatus;
  /** Entier de francs, tel que la passerelle le rapporte. Sert à comparer. */
  amountXof: number | null;
  currency: string | null;
  /**
   * La commission réellement prélevée, en francs, quand la passerelle la
   * donne. C'est le seul poste de coût de la plateforme qu'un fournisseur
   * chiffre lui-même, transaction par transaction — voir
   * `docs/etude-des-couts.md` §2.4. Le jeter serait retomber dans l'estimation.
   */
  feeXof: number | null;
  /** Ce que le payeur a réellement été débité, commission comprise. */
  chargedXof: number | null;
  /** Ce qui nous reste après commission. */
  netXof: number | null;
  /** L'identifiant de la transaction côté prestataire, pour la piste d'audit. */
  transactionId: string | null;
};

/**
 * Ce qu'un rappel permet de retrouver — et c'est **la** différence entre deux
 * prestataires qui casse en silence.
 *
 * - `reference` : le rappel porte la clé qu'on a stockée. On va droit à
 *   l'encaissement concerné.
 * - `nothing` : le rappel ne porte **aucun identifiant venant de nous**. C'est
 *   le cas de SasPay : sa charge n'a ni métadonnées ni id de session, seulement
 *   une référence de transaction qu'il a générée et que nous n'avons jamais
 *   vue. Le rappel n'est alors qu'un **réveil** : il faut relire nos propres
 *   encaissements en attente pour trouver celui qui vient d'aboutir.
 *
 * Traiter un prestataire `nothing` comme un `reference` ne lève aucune erreur —
 * on cherche simplement une référence introuvable, et **le client paie sans
 * jamais être crédité**. D'où cette propriété sur le contrat plutôt qu'une
 * convention.
 */
export type CallbackIdentification = 'reference' | 'nothing';

export type CallbackEvent = {
  /** Nom d'événement du prestataire, tel quel. Sert au journal et à l'unicité. */
  name: string;
  /** Ce que le rappel prétend être devenu. À confirmer par `settle()`. */
  status: SettlementStatus;
  /** La clé de l'encaissement, si le prestataire la porte. Sinon `null`. */
  reference: string | null;
  /**
   * Identifiant de l'événement lui-même, pour l'unicité en base. Quand le
   * prestataire n'en donne pas, l'implémentation en dérive un stable — deux
   * livraisons du même événement doivent tomber sur la même valeur.
   */
  eventId: string;
};

export interface PaymentGateway {
  /** Le nom du prestataire, pour que le journal et la facture s'expliquent. */
  readonly provider: string;
  /** Ce qu'un de ses rappels permet de retrouver. */
  readonly callbackIdentifies: CallbackIdentification;
  /** La route qui lit SES rappels — chacun signe et met en forme à sa façon. */
  readonly callbackPath: string;

  /** Ouvre un encaissement. Rend de quoi le retrouver et où envoyer le payeur. */
  openCheckout(request: CheckoutRequest): Promise<OpenedCheckout>;

  /**
   * L'état réel d'un encaissement, lu chez le prestataire.
   *
   * **C'est la seule source de vérité.** Un corps de rappel peut être forgé,
   * rejoué, ou simplement en retard ; celui-ci ne peut pas.
   */
  settle(reference: string): Promise<Settlement>;

  /**
   * Vérifie la signature d'un rappel. Aucune ligne n'est écrite avant qu'elle
   * passe : écrire avant de vérifier offre à un inconnu une table à remplir.
   */
  verifyCallback(input: {
    headers: Record<string, string>;
    rawBody: string;
    now?: number;
  }): boolean;

  /** Lit un rappel déjà vérifié. Lève si le corps n'est pas exploitable. */
  readCallback(rawBody: string, headers: Record<string, string>): CallbackEvent;

  /** L'appel inoffensif qui prouve qu'une paire de clés fonctionne. */
  ping(): Promise<Record<string, unknown>>;
}

export class PaymentNotConfiguredError extends Error {
  readonly statusCode = 503;

  constructor(missing: string) {
    super(`Payments are not configured: ${missing} is missing.`);
    this.name = 'PaymentNotConfiguredError';
  }
}

export class PaymentError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'PaymentError';
    this.statusCode = options.status ?? 502;
    this.code = options.code;
  }
}

/** Cinq minutes : la tolérance anti-rejeu, la même chez les deux prestataires. */
export const SIGNATURE_TOLERANCE_S = 300;

export function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Un montant en francs, refusé s'il n'est pas un entier positif.
 *
 * XOF n'a pas de centimes. Un flottant qui traîne ici finit en écart de
 * caisse — et un écart de caisse ne se rattrape pas.
 */
export function assertXofAmount(amount: number): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new PaymentError(`Amount must be a positive whole ${CURRENCY} value.`, {
      status: 400,
    });
  }
  return amount;
}

/**
 * Lit un montant rendu par une passerelle, qu'elle l'écrive en nombre ou en
 * chaîne décimale (`"15000.00"`).
 *
 * Rend `null` plutôt que `0` sur une valeur illisible : zéro est un montant
 * valide, et le confondre avec « inconnu » ferait passer une comparaison qui
 * devait échouer.
 */
export function parseXof(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}
