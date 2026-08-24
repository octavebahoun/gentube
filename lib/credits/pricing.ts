import type { Plan, Resolution } from '@/lib/db/schema';

/**
 * Tarification en crédits — source unique de vérité.
 *
 * Unité (cahier des charges §1, non négociable) : 1 crédit = 1 seconde de
 * vidéo générée en 480p. La 720p coûte 4 crédits/seconde.
 */
export const CREDITS_PER_SECOND: Record<Resolution, number> = {
  '480p': 1,
  '720p': 4,
};

/** Coût de référence Replicate par seconde de *vidéo générée* (cahier des charges §1). */
export const PROVIDER_COST_USD_PER_SECOND: Record<Resolution, number> = {
  '480p': 0.012,
  '720p': 0.046,
};

export const FCFA_PER_USD = 625;

/**
 * ⚠️ La colonne « Crédits » du tableau §1 du cahier des charges est incohérente
 * avec l'unité de crédit définie dans la même section. Lue littéralement :
 *
 *   Starter = 10 000 crédits = 10 000 s en 480p = 166 min,
 *   mais la même ligne prétend ~23 min, et 10 000 s coûte $120 de Replicate
 *   pour un plan à 15 000 FCFA (~$24).
 *
 * Les nombres se réconcilient si cette cellule est le *budget de calcul* en
 * FCFA (prix du plan moins part plateforme), pas un nombre de crédits :
 *
 *   Starter : 15 000 − 5 000 = 10 000 FCFA ≈ $16 → $16 / $0.012 = 1 333 s ≈ 22 min ✓
 *   Pro :     30 000 − 8 000 = 22 000 FCFA ≈ $35 → $35 / $0.012 = 2 933 s ≈ 49 min ✓
 *
 * Les deux matchent la colonne "~480p" du même tableau, donc les dotations
 * ci-dessous sont dérivées ainsi. Changez ces deux nombres si l'intention
 * était différente — c'est le seul endroit où ils apparaissent.
 */
export const PLAN_MONTHLY_CREDITS: Record<Plan, number> = {
  starter: 1_333,
  pro: 3_000,
  business: 0, // négocié par contrat
};

export const PLAN_PRICE_FCFA: Record<Plan, number | null> = {
  starter: 15_000,
  pro: 30_000,
  business: null, // sur devis
};

/**
 * Packs de recharge (cahier des charges §1). Valeur conservée telle que
 * spécifiée.
 *
 * ⚠️ À l'unité spécifiée ce pack vend 3 000 s de 480p (≈ $36 de Replicate)
 * pour 5 000 FCFA (≈ $8) — une perte d'environ $28 par pack. Le point mort à
 * la part de calcul du plan Starter (~2/3) serait ≈ 450 crédits. Utilisez
 * topUpMarginFcfa() pour vérifier avant de mettre les paiements en ligne.
 */
export const TOPUP_PACKS: { priceFcfa: number; credits: number }[] = [
  { priceFcfa: 5_000, credits: 3_000 },
];

function assertPositiveDuration(durationS: number): void {
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new RangeError(`Invalid shot duration: ${durationS}s (must be > 0).`);
  }
}

/** Crédits requis pour générer un plan. Toujours arrondi au-dessus. */
export function creditsForShot(
  durationS: number,
  resolution: Resolution
): number {
  assertPositiveDuration(durationS);
  return Math.ceil(durationS * CREDITS_PER_SECOND[resolution]);
}

/**
 * Crédits requis pour un storyboard entier. Arrondi au-dessus par plan, car
 * un plan est l'unité réellement envoyée au fournisseur.
 */
export function estimateVideoCredits(
  shots: { durationS: number }[],
  resolution: Resolution
): number {
  return shots.reduce(
    (total, shot) => total + creditsForShot(shot.durationS, resolution),
    0
  );
}

/** Ce que ces crédits sont censés nous coûter chez le fournisseur, en USD. */
export function providerCostUsd(
  credits: number,
  resolution: Resolution
): number {
  const seconds = credits / CREDITS_PER_SECOND[resolution];
  return seconds * PROVIDER_COST_USD_PER_SECOND[resolution];
}

/** Secondes de vidéo qu'un solde achète à une résolution donnée. */
export function secondsAffordable(
  credits: number,
  resolution: Resolution
): number {
  return Math.floor(credits / CREDITS_PER_SECOND[resolution]);
}

/** Marge brute d'un pack de recharge, en FCFA, au coût fournisseur 480p. */
export function topUpMarginFcfa(pack: {
  priceFcfa: number;
  credits: number;
}): number {
  const costFcfa = providerCostUsd(pack.credits, '480p') * FCFA_PER_USD;
  return Math.round(pack.priceFcfa - costFcfa);
}
