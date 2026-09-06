import type { Quality } from '@/lib/db/schema';
import {
  MAX_SHOT_SECONDS,
  PROVIDER_COST_USD_PER_SECOND,
} from '@/lib/credits/pricing';

/**
 * Quel modèle anime quel plan, et dans quelles bornes.
 *
 * **Un seul modèle en v1 : `prunaai/p-video`, en 1080p.** Ce qui distingue les
 * deux paliers vendus n'est pas la résolution mais son booléen `draft`, quatre
 * fois moins cher (docs/tarifs.md).
 *
 * `wan-video/wan-2.2-i2v-fast` est sorti de la v1. Il facturait au clip, avec
 * un plancher de 81 images — 5,06 s — qui obligeait le storyboard à refuser
 * toute scène plus courte, et faisait payer 5 s une scène de 3. p-video
 * facture à la seconde réelle : ce plancher disparaît, et avec lui l'écart
 * entre ce qu'on facture au client et ce qu'on paie au fournisseur.
 *
 * `prunaai/p-video-avatar` n'est pas ici non plus : rien dans le schéma ne
 * distingue encore un plan avatar d'un plan animé ordinaire. Une route que
 * personne ne peut demander est une route qu'on ne peut pas tester.
 */

export const MODELS = {
  pVideo: 'prunaai/p-video',
} as const;

export type VideoModel = (typeof MODELS)[keyof typeof MODELS];

/** La résolution de rendu, constante en v1 : les deux paliers sont en 1080p. */
export const P_VIDEO_RESOLUTION = '1080p' as const;

/**
 * Plafond du modèle : `duration` est un entier de 1 à 10 secondes. Une scène
 * plus longue se découpe et s'enchaîne au montage.
 */
export const P_VIDEO_MAX_SECONDS = MAX_SHOT_SECONDS;

/** Aucun plancher : p-video accepte la seconde la plus petite. */
export const P_VIDEO_MIN_SECONDS = 1;

export function modelFor(): VideoModel {
  return MODELS.pVideo;
}

/**
 * La scène animée la plus longue que le modèle sait rendre d'un trait.
 *
 * C'est le plafond que le storyboard doit respecter. Le dépasser obligerait à
 * ralentir le clip pour couvrir la voix off, et un ralenti se voit.
 */
export function maxClipSeconds(): number {
  return P_VIDEO_MAX_SECONDS;
}

/**
 * La scène animée la plus courte qui ne gaspille rien.
 *
 * Elle vaut une seconde, c'est-à-dire aucune contrainte. Elle reste une
 * fonction plutôt qu'une constante parce que le jour où un modèle à plancher
 * revient — Wan en facturait 5,06 — c'est ici que ça se rebranche, et le
 * storyboard n'a pas à le savoir.
 */
export function minClipSeconds(): number {
  return P_VIDEO_MIN_SECONDS;
}

/**
 * Les secondes réellement facturées, arrondies comme le fournisseur arrondit.
 *
 * p-video prend `duration` en entier : une narration de 6,2 s part à 7, et la
 * seconde entamée est due. C'est le même arrondi que celui du prix en crédits
 * — `creditsForShot` arrondit aussi au-dessus — pour qu'ils ne divergent
 * jamais.
 */
export function billedSeconds(durationS: number): number {
  return Math.ceil(durationS);
}

/**
 * Ce que ce clip nous coûtera, en USD — connu **avant** de générer.
 *
 * Les taux viennent de `lib/credits/pricing.ts`, qui reste la source unique.
 * Ce qui est propre à ce fichier, c'est la *forme* de la facturation.
 */
export function clipCostUsd(quality: Quality, durationS: number): number {
  return billedSeconds(durationS) * PROVIDER_COST_USD_PER_SECOND[quality];
}
