import {
  PLAN_MONTHLY_CREDITS,
  PLAN_PRICE_FCFA,
  TOPUP_PACKS,
} from '@/lib/credits/pricing';

/**
 * Le catalogue de facturation — écrit à la main, volontairement.
 *
 * Il n'y a ni table de plans ni écran d'administration pour éditer les prix :
 * une offre est une constante dans ce fichier, relue et déployée comme
 * n'importe quel autre changement de code. Ce qu'un tenant paie et combien de
 * crédits il reçoit sont les deux nombres qui décident si le produit gagne ou
 * perd de l'argent, donc ils appartiennent à un diff, pas à une ligne que
 * quelqu'un peut modifier à 2h du matin.
 *
 * Les prix et dotations eux-mêmes viennent de lib/credits/pricing.ts, qui est
 * la source unique de vérité pour l'unité de crédit. Ce module ne fait que les
 * transformer en choses achetables.
 */

/** Plans qu'un tenant peut acheter en libre-service. `business` est sur devis (cahier des charges §1). */
export const PURCHASABLE_PLANS = ['starter', 'pro'] as const;
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export type PlanOffer = {
  plan: PurchasablePlan;
  name: string;
  /** Prix mensuel en XOF entier — la devise n'a pas de sous-unité. */
  priceXof: number;
  /** Crédits accordés quand un cycle est payé. */
  monthlyCredits: number;
};

export const PLAN_OFFERS: Record<PurchasablePlan, PlanOffer> = {
  starter: {
    plan: 'starter',
    name: 'Starter',
    priceXof: PLAN_PRICE_FCFA.starter as number,
    monthlyCredits: PLAN_MONTHLY_CREDITS.starter,
  },
  pro: {
    plan: 'pro',
    name: 'Pro',
    priceXof: PLAN_PRICE_FCFA.pro as number,
    monthlyCredits: PLAN_MONTHLY_CREDITS.pro,
  },
};

export type TopupPack = {
  id: string;
  priceXof: number;
  credits: number;
};

/**
 * Packs de crédits ponctuels (cahier des charges §1). Les crédits achetés
 * n'expirent jamais — contrairement à la dotation du plan, qui appartient à
 * son cycle.
 *
 * ⚠️ Au tarif spécifié ce pack est vendu en dessous du coût fournisseur ; la
 * marge est vérifiée négative par lib/credits/pricing.test.ts pour que le
 * problème ne puisse pas être oublié. Le vendre est une décision de
 * tarification, pas d'implémentation — le nombre vit dans pricing.ts et
 * nulle part ailleurs.
 */
export const TOPUP_PACKS_FOR_SALE: TopupPack[] = TOPUP_PACKS.map((pack) => ({
  id: `topup-${pack.priceFcfa}`,
  priceXof: pack.priceFcfa,
  credits: pack.credits,
}));

/** Code ISO envoyé à la passerelle. Le mobile money de la zone est uniquement XOF. */
export const CURRENCY = 'XOF';

/** Un cycle de facturation fait 30 jours plats : pas de prorata, pas de calcul en cours de cycle. */
export const BILLING_CYCLE_DAYS = 30;

/**
 * Paiements échoués tolérés sur un cycle avant que l'abonnement soit suspendu
 * (cahier des charges §3.A : « retry, puis passage du tenant en suspended »).
 */
export const MAX_PAYMENT_ATTEMPTS = 3;

export class UnknownOfferError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'UnknownOfferError';
  }
}

export class InvalidAmountError extends Error {
  constructor(amount: unknown) {
    super(
      `Invalid XOF amount: ${JSON.stringify(amount)}. ` +
        'Amounts are whole XOF integers — the currency has no minor unit.'
    );
    this.name = 'InvalidAmountError';
  }
}

export function isPurchasablePlan(value: unknown): value is PurchasablePlan {
  return (
    typeof value === 'string' &&
    (PURCHASABLE_PLANS as readonly string[]).includes(value)
  );
}

/** Résout une offre de plan, en refusant tout ce qui n'est pas vendu en libre-service. */
export function getPlanOffer(plan: unknown): PlanOffer {
  if (!isPurchasablePlan(plan)) {
    throw new UnknownOfferError(
      `Plan ${JSON.stringify(plan)} cannot be bought online. ` +
        `Available: ${PURCHASABLE_PLANS.join(', ')} (business is on quote).`
    );
  }
  return PLAN_OFFERS[plan];
}

export function getTopupPack(id: unknown): TopupPack {
  const pack = TOPUP_PACKS_FOR_SALE.find((candidate) => candidate.id === id);
  if (!pack) {
    throw new UnknownOfferError(
      `Unknown top-up pack ${JSON.stringify(id)}. ` +
        `Available: ${TOPUP_PACKS_FOR_SALE.map((p) => p.id).join(', ')}.`
    );
  }
  return pack;
}

/**
 * Vérifie chaque montant allant vers ou venant de la passerelle. Le XOF n'a
 * pas de décimales, donc un float ici est toujours un bug — et un float
 * arrondi serait un paiement erroné silencieux.
 */
export function assertXofAmount(amount: unknown): number {
  if (!Number.isInteger(amount) || (amount as number) <= 0) {
    throw new InvalidAmountError(amount);
  }
  return amount as number;
}

/** Fin du cycle qui commence à `from`. */
export function cyclePeriodEnd(from: Date): Date {
  return new Date(from.getTime() + BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000);
}
