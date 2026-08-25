import type { Plan, Resolution, ShotType } from '@/lib/db/schema';

/**
 * Tarification en crédits — source unique de vérité.
 *
 * **Unité : 1 crédit = 1 seconde d'image fixe en 480p.**
 *
 * Un plan animé coûte le double, parce qu'il nous coûte réellement bien plus :
 * une minute de clips revient à ~400 FCFA de fournisseur contre ~30 FCFA pour
 * des images fixes. Facturer les deux au même prix faisait payer aux clients
 * « diaporama » — l'usage d'entrée de gamme, le plus sensible au prix — le
 * tarif de la vidéo générée.
 *
 * Le 720p coûte 3× le 480p : réellement ~2,1× plus cher, facturé un peu
 * au-dessus. Chiffrage complet dans docs/tarifs.md.
 */
export const CREDITS_PER_SECOND: Record<ShotType, Record<Resolution, number>> = {
  image: { '480p': 1, '720p': 3 },
  video: { '480p': 2, '720p': 6 },
};

/**
 * Coût fournisseur réel, mesuré le 25 août 2026 sur `wan-2.2-i2v-fast`.
 *
 * Replicate facture **par vidéo générée**, pas par seconde : 81 images à
 * 16 fps font 5,06 s de clip, à 0,05 $ en 480p et 0,11 $ en 720p. D'où les
 * valeurs par seconde ci-dessous.
 *
 * Les images fixes passent par Flux sur Cloudflare Workers AI, dont le coût
 * est d'un autre ordre de grandeur. La valeur ci-dessous est une borne haute
 * prudente tant que rien n'est mesuré en production — à corriger dès que le
 * pipeline image tourne pour de vrai.
 */
export const PROVIDER_COST_USD_PER_SECOND: Record<
  ShotType,
  Record<Resolution, number>
> = {
  image: { '480p': 0.0008, '720p': 0.0012 },
  video: { '480p': 0.00988, '720p': 0.02174 },
};

export const FCFA_PER_USD = 625;

/**
 * Dotations mensuelles, tranchées le 25 août 2026 (docs/tarifs.md).
 *
 * Exprimées dans l'unité image, donc le double de ce qu'un plan « tout
 * animé » consomme :
 *
 *   Starter : 15 000 FCFA → 2 640 crédits = 22 min animées, ou 44 min d'images
 *   Pro     : 30 000 FCFA → 5 400 crédits = 45 min animées, ou 90 min d'images
 *
 * Le revenu sur une vidéo animée est inchangé : seul l'usage image devient
 * deux fois moins cher.
 */
export const PLAN_MONTHLY_CREDITS: Record<Plan, number> = {
  starter: 2_640,
  pro: 5_400,
  business: 0, // négocié par contrat
};

export const PLAN_PRICE_FCFA: Record<Plan, number | null> = {
  starter: 15_000,
  pro: 30_000,
  business: null, // sur devis
};

/**
 * Packs de recharge (docs/tarifs.md) : 5 000 FCFA = 720 crédits, soit 6 min
 * animées ou 12 min d'images.
 *
 * Volontairement plus chère à la minute que l'abonnement (833 vs 682 FCFA la
 * minute animée), sinon personne ne s'abonne. `topUpMarginFcfa()` vérifie
 * qu'elle reste bénéficiaire au pire cas.
 */
export const TOPUP_PACKS: { priceFcfa: number; credits: number }[] = [
  { priceFcfa: 5_000, credits: 720 },
];

function assertPositiveDuration(durationS: number): void {
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new RangeError(`Invalid shot duration: ${durationS}s (must be > 0).`);
  }
}

/** Crédits requis pour générer un plan. Toujours arrondi au-dessus. */
export function creditsForShot(
  durationS: number,
  type: ShotType,
  resolution: Resolution
): number {
  assertPositiveDuration(durationS);
  return Math.ceil(durationS * CREDITS_PER_SECOND[type][resolution]);
}

/**
 * Crédits requis pour un storyboard entier. Arrondi au-dessus par plan, car
 * un plan est l'unité réellement envoyée au fournisseur — et parce que le
 * tarif dépend maintenant du type de chaque plan, pas seulement de la durée
 * totale.
 */
export function estimateVideoCredits(
  shots: { durationS: number; type: ShotType }[],
  resolution: Resolution
): number {
  return shots.reduce(
    (total, shot) => total + creditsForShot(shot.durationS, shot.type, resolution),
    0
  );
}

/** Ce que ces crédits sont censés nous coûter chez le fournisseur, en USD. */
export function providerCostUsd(
  credits: number,
  type: ShotType,
  resolution: Resolution
): number {
  const seconds = credits / CREDITS_PER_SECOND[type][resolution];
  return seconds * PROVIDER_COST_USD_PER_SECOND[type][resolution];
}

/** Secondes qu'un solde achète, pour un type de plan et une résolution. */
export function secondsAffordable(
  credits: number,
  type: ShotType,
  resolution: Resolution
): number {
  return Math.floor(credits / CREDITS_PER_SECOND[type][resolution]);
}

/**
 * Marge brute d'un pack de recharge, en FCFA.
 *
 * Calculée au **pire cas** — tout le pack dépensé en plans animés — pour
 * qu'un pack bénéficiaire ici le soit quel que soit l'usage réel.
 */
export function topUpMarginFcfa(pack: {
  priceFcfa: number;
  credits: number;
}): number {
  const costFcfa = providerCostUsd(pack.credits, 'video', '480p') * FCFA_PER_USD;
  return Math.round(pack.priceFcfa - costFcfa);
}
