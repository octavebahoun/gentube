import type { Plan, Quality, ShotType } from '@/lib/db/schema';

/**
 * Tarification en crédits — source unique de vérité.
 *
 * **Unité : 1 crédit = 20 FCFA.** Le crédit est ancré dans la monnaie, plus
 * dans une seconde de rendu. C'est ce qui permet de changer de modèle vidéo
 * sans renverser la grille : seul le nombre de crédits par seconde bouge.
 *
 * Grille v1 du 5 septembre 2026 (docs/tarifs.md). Un seul modèle vidéo,
 * `prunaai/p-video`, en 1080p. Atlas Cloud et wan-2.2 sont hors v1.
 */
export const CREDIT_FCFA = 20;

export const FCFA_PER_USD = 625;

/**
 * Ce que le client voit. Le mot « draft » ne doit **jamais** atteindre une
 * interface : il décrit un mode du modèle, pas ce qu'on livre.
 */
export const QUALITY_LABEL: Record<Quality, string> = {
  draft: 'Full HD',
  standard: 'Cinéma',
};

/**
 * Crédits par seconde de vidéo, par palier.
 *
 * Les deux rendent en 1080p. Ce qui les sépare est le booléen `draft` de
 * p-video, et l'écart de coût est d'un facteur quatre — d'où l'écart de prix.
 */
export const CREDITS_PER_SECOND: Record<Quality, number> = {
  draft: 2,
  standard: 7,
};

/**
 * Une image se paie **une fois**, quelle que soit sa durée à l'écran.
 *
 * C'est le changement de fond de la v1 : facturer une fixe à la seconde
 * faisait payer la durée d'un plan qui ne coûte rien de plus en restant
 * affiché. 3 crédits = 60 FCFA pour 0,2 FCFA de coût réel.
 */
export const CREDITS_PER_IMAGE = 3;

/** Voix off et lecture de documents, par tranche de 1 000 caractères entamée. */
export const CREDITS_PER_1000_CHARS = 5;

/**
 * Le montage final : c'est la promesse commerciale du produit, pas une
 * option. Coché par défaut dans l'interface.
 */
export const CREDITS_MONTAGE = 25;

/** Import d'une vidéo du client, découpe et sous-titrage. Forfait. */
export const CREDITS_IMPORT = 25;

/**
 * Coût fournisseur réel, en USD par seconde de 1080p.
 *
 * Relevé sur https://replicate.com/prunaai/p-video/readme le 5 septembre 2026.
 * Le readme donne aussi le 720p — 0,005 $ et 0,02 $ — qui ne sert pas en v1.
 *
 * ⚠️ Le tarif payant de p-video démarre le lundi 9 h CET. Ces valeurs sont
 * celles annoncées : à revérifier avant lancement.
 */
export const PROVIDER_COST_USD_PER_SECOND: Record<Quality, number> = {
  draft: 0.01,
  standard: 0.04,
};

/**
 * Plafond d'une génération, imposé par le modèle : `duration` est un entier
 * de 1 à 10 secondes. Les scènes plus longues sont enchaînées par le montage.
 *
 * Et pas de plancher : p-video facture à la seconde réelle, contrairement à
 * wan-2.2 qui facturait au clip et imposait 5 secondes minimum.
 */
export const MAX_SHOT_SECONDS = 10;

/** Résolution de rendu, constante en v1. */
export const RENDER_WIDTH = 1920;
export const RENDER_HEIGHT = 1080;

/**
 * Le palier accessible selon le plan.
 *
 * Starter reste en Full HD : à 7 crédits la seconde, un quota Starter
 * intégralement dépensé en Cinéma coûterait plus que l'abonnement ne rapporte
 * une fois le reste des postes comptés.
 *
 * ⚠️ Le plafond Pro — 200 crédits de Cinéma par cycle — n'est **pas** applique
 * ici : il demande un compteur par cycle de facturation, pas une constante.
 * Tant qu'il n'existe pas, un client Pro peut dépenser tout son quota en
 * Cinéma. La marge reste positive, mais elle tombe à ~69 %.
 */
export const QUALITY_BY_PLAN: Record<Plan, Quality[]> = {
  starter: ['draft'],
  pro: ['draft', 'standard'],
  business: ['draft', 'standard'],
};

/** Plafond mensuel de Cinéma sur Pro, en crédits. Pas encore applique. */
export const STANDARD_MONTHLY_CAP_CREDITS = 200;

/**
 * Dotations mensuelles, grille v1.
 *
 *   Starter : 15 000 FCFA → 1 000 crédits ≈ 12 vidéos de 30 s en Full HD
 *   Pro     : 35 000 FCFA → 2 600 crédits ≈ 30 vidéos
 *
 * Ne jamais promettre un nombre de vidéos ferme côté client : il dépend du
 * palier choisi et de la part d'images fixes.
 */
export const PLAN_MONTHLY_CREDITS: Record<Plan, number> = {
  starter: 1_000,
  pro: 2_600,
  business: 0, // négocié par contrat
};

export const PLAN_PRICE_FCFA: Record<Plan, number | null> = {
  starter: 15_000,
  pro: 35_000,
  business: null, // sur devis
};

/**
 * Dotation offerte à l'inscription, sans paiement.
 *
 * 120 crédits = une minute de vidéo en Full HD, montage compris de justesse.
 * Assez pour juger le résultat, pas assez pour s'en servir d'abonnement.
 *
 * Le coût réel au pire est de 750 FCFA — tout en Cinéma — et de 375 FCFA en
 * Full HD. C'est un budget publicitaire, pas une fuite.
 */
export const TRIAL_CREDITS = 120;

/** Palier imposé tant qu'aucun abonnement n'est actif. */
export const TRIAL_QUALITY: Quality = 'draft';

/**
 * Packs de recharge, grille v1.
 *
 * La remise plafonne à 13 % sur le plus gros pack. **Ne jamais descendre plus
 * bas** : le coût fournisseur ne baisse pas avec le volume, donc chaque franc
 * de remise sort directement de la marge.
 */
export const TOPUP_PACKS: { priceFcfa: number; credits: number }[] = [
  { priceFcfa: 2_000, credits: 100 },
  { priceFcfa: 5_500, credits: 300 },
  { priceFcfa: 13_000, credits: 750 },
];

function assertPositiveDuration(durationS: number): void {
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new RangeError(`Invalid shot duration: ${durationS}s (must be > 0).`);
  }
}

/**
 * Crédits requis pour générer un plan.
 *
 * Une image est un forfait : sa durée à l'écran ne nous coûte rien de plus.
 * Une vidéo se paie à la seconde, arrondie au-dessus — c'est la seconde
 * entière qui part au modèle.
 */
export function creditsForShot(
  durationS: number,
  type: ShotType,
  quality: Quality
): number {
  assertPositiveDuration(durationS);
  if (type === 'image') return CREDITS_PER_IMAGE;
  return Math.ceil(durationS * CREDITS_PER_SECOND[quality]);
}

/**
 * Crédits requis pour un storyboard entier, montage compris.
 *
 * Le montage est dans le total par défaut parce qu'il est coché par défaut :
 * un devis qui l'omettrait annoncerait un prix que le client ne paiera jamais.
 */
export function estimateVideoCredits(
  shots: { durationS: number; type: ShotType }[],
  quality: Quality,
  { montage = true }: { montage?: boolean } = {}
): number {
  const plans = shots.reduce(
    (total, shot) => total + creditsForShot(shot.durationS, shot.type, quality),
    0
  );
  if (plans === 0) return 0;
  return plans + (montage ? CREDITS_MONTAGE : 0);
}

/** Crédits d'une voix off, par tranche de 1 000 caractères entamée. */
export function creditsForSpeech(characters: number): number {
  if (characters <= 0) return 0;
  return Math.ceil(characters / 1_000) * CREDITS_PER_1000_CHARS;
}

/**
 * Ce que ces crédits nous coûtent chez le fournisseur, en USD, **au pire cas**
 * — tout dépensé en vidéo de ce palier.
 *
 * Le pire cas et pas la moyenne : une marge vérifiée ici tient quel que soit
 * l'usage réel. Les images et la voix coûtent des ordres de grandeur moins.
 */
export function providerCostUsd(credits: number, quality: Quality): number {
  const seconds = credits / CREDITS_PER_SECOND[quality];
  return seconds * PROVIDER_COST_USD_PER_SECOND[quality];
}

/** Secondes de vidéo qu'un solde achète, pour un palier donné. */
export function secondsAffordable(credits: number, quality: Quality): number {
  return Math.floor(credits / CREDITS_PER_SECOND[quality]);
}

/** Images fixes qu'un solde achète. */
export function imagesAffordable(credits: number): number {
  return Math.floor(credits / CREDITS_PER_IMAGE);
}

/** Prix d'affichage d'un nombre de crédits, en FCFA. */
export function creditsToFcfa(credits: number): number {
  return credits * CREDIT_FCFA;
}

/**
 * Marge brute d'un pack de recharge, en FCFA.
 *
 * Calculée au pire cas — tout le pack dépensé en Cinéma — pour qu'un pack
 * bénéficiaire ici le soit quel que soit l'usage réel.
 */
export function topUpMarginFcfa(pack: {
  priceFcfa: number;
  credits: number;
}): number {
  const costFcfa = providerCostUsd(pack.credits, 'standard') * FCFA_PER_USD;
  return Math.round(pack.priceFcfa - costFcfa);
}
