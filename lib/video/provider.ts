import type { Resolution } from '@/lib/db/schema';
import { PROVIDER_COST_USD_PER_SECOND } from '@/lib/credits/pricing';

/**
 * Quel modèle anime quel plan, et dans quelles bornes.
 *
 * Deux modèles en service, choisis par la résolution — le raisonnement est
 * dans `docs/providers.md`. Wan est deux fois moins cher en 480p, la
 * résolution par défaut où passera l'essentiel du volume ; en 720p l'avantage
 * s'inverse.
 *
 * Le troisième modèle du document, `prunaai/p-video-avatar`, n'est pas ici :
 * rien dans le schéma ne distingue encore un plan avatar d'un plan animé
 * ordinaire. Le jour où cette distinction existera en base, elle entrera dans
 * `modelFor` — pas avant, une route que personne ne peut demander est une
 * route qu'on ne peut pas tester.
 */

export const MODELS = {
  wan: 'wan-video/wan-2.2-i2v-fast',
  pVideo: 'prunaai/p-video',
} as const;

export type VideoModel = (typeof MODELS)[keyof typeof MODELS];

/**
 * Wan génère toutes ses images en un seul bloc, et ce bloc va de **81 à 121
 * images** — le schéma du modèle le borne ainsi, ce n'est pas un réglage de
 * prix. À 16 images par seconde, cela fait un clip de 5,06 s à 7,56 s.
 *
 * Les deux bornes sont dures. En dessous, le modèle refuse ; c'est ce plancher
 * qui justifie qu'une scène animée ne descende pas sous 5 s de narration. Au
 * dessus, il faudrait enchaîner deux clips — et le second aurait lui aussi son
 * plancher de 5 s, donc 12,6 s générées pour 9 s d'audio. Une narration plus
 * longue se découpe en deux scènes ; c'est la grammaire du storyboard.
 */
export const WAN_FPS = 16;
export const WAN_MIN_FRAMES = 81;
export const WAN_MAX_FRAMES = 121;
export const WAN_MIN_SECONDS = WAN_MIN_FRAMES / WAN_FPS;
export const WAN_MAX_SECONDS = WAN_MAX_FRAMES / WAN_FPS;

/** Plafond de p-video, imposé par le modèle. */
export const P_VIDEO_MAX_SECONDS = 10;

export function modelFor(resolution: Resolution): VideoModel {
  return resolution === '720p' ? MODELS.pVideo : MODELS.wan;
}

/**
 * La scène animée la plus longue que cette résolution sait rendre d'un trait.
 *
 * C'est le plafond que le storyboard doit respecter. Le dépasser obligerait à
 * ralentir le clip pour couvrir la voix off, et un ralenti se voit.
 */
export function maxClipSeconds(resolution: Resolution): number {
  return modelFor(resolution) === MODELS.wan
    ? WAN_MAX_SECONDS
    : P_VIDEO_MAX_SECONDS;
}

/**
 * Le nombre d'images à demander à Wan pour couvrir cette narration.
 *
 * Sans ce calcul, Wan applique ses 81 images d'usine et rend 5,06 s quelle que
 * soit la scène : une voix off de 7 s jouerait deux secondes sur une image
 * arrêtée.
 */
export function wanFrames(durationS: number): number {
  const wanted = Math.round(durationS * WAN_FPS);
  return Math.min(WAN_MAX_FRAMES, Math.max(WAN_MIN_FRAMES, wanted));
}

/**
 * Les secondes réellement facturées, arrondies comme le fournisseur arrondit.
 *
 * Wan facture **à la durée du clip rendu**, ramenée à 16 fps — c'est écrit
 * dans son schéma. Comme il ne descend pas sous 81 images, une scène de 3 s se
 * paie 5,06 s : c'est là, et seulement là, que la marge se perd.
 *
 * p-video prend `duration` en entier : une narration de 6,2 s part à 7, et la
 * seconde entamée est due.
 */
export function billedSeconds(
  resolution: Resolution,
  durationS: number
): number {
  if (modelFor(resolution) === MODELS.wan) {
    return wanFrames(durationS) / WAN_FPS;
  }
  return Math.ceil(durationS);
}

/**
 * Ce que ce clip nous coûtera, en USD — connu **avant** de générer.
 *
 * Les taux viennent de `lib/credits/pricing.ts`, qui reste la source unique.
 * Ce qui est propre à ce fichier, c'est la *forme* de la facturation.
 */
export function clipCostUsd(resolution: Resolution, durationS: number): number {
  return (
    billedSeconds(resolution, durationS) *
    PROVIDER_COST_USD_PER_SECOND.video[resolution]
  );
}
