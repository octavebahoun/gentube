import { AnimationNotConfiguredError, read, type VideoAnimator } from './contract';
import { createAtlasAnimator, isAtlasConfigured } from './atlas';
import { createNovitaAnimator, isNovitaConfigured } from './novita';
import { createReplicateAnimator, isAnimationConfigured } from './replicate';

/**
 * La passerelle des plans animés.
 *
 * **Pourquoi elle existe.** Il y avait déjà deux fournisseurs et deux chemins :
 * `createAnimator()` rendait Replicate en dur, et Novita vivait à côté, importé
 * directement par son action serveur. Un troisième fournisseur aurait fait un
 * troisième chemin. Le modèle est celui de `lib/voice/index.ts`, qui tient
 * trois synthétiseurs derrière un contrat depuis le début : un type nommé, une
 * fonction qui choisit, une fonction qui construit.
 *
 * **Le métier n'appelle que `createAnimator()`.** Changer de fournisseur est
 * une variable d'environnement, pas un déploiement — ce qui est le point même,
 * quand on passe ses semaines à comparer des modèles.
 *
 * **Ce que la passerelle ne cache pas.** Elle ne prétend pas que les
 * fournisseurs sont interchangeables : ils ne le sont pas. Replicate et Atlas
 * rappellent, Novita non, et cette différence-là casse en silence si on la
 * range sous le tapis. Elle est donc **déclarée** sur le contrat
 * (`resolution`), et c'est l'orchestrateur qui la lit.
 *
 * **Ce qu'un fournisseur qui rappelle doit avoir en plus.** Sa propre route :
 * la charge d'Atlas n'est pas celle de Replicate, et sa signature non plus —
 * Ed25519 sur un JWKS contre HMAC sur un secret partagé. Les deux existent
 * (`app/api/webhooks/{replicate,atlas}`) et `callbackPath` dit laquelle est la
 * sienne. Un fournisseur qui rappelle sans route déclarée est refusé.
 */

export {
  ANIMATE_STEP,
  AnimationError,
  AnimationNotConfiguredError,
  type AnimationJobPayload,
  type AnimationOutcome,
  type AnimationRequest,
  type ResolutionMode,
  type SubmittedAnimation,
  type VideoAnimator,
} from './contract';

export {
  MODELS,
  P_VIDEO_MAX_SECONDS,
  WAN_MAX_SECONDS,
  WAN_MIN_SECONDS,
  billedSeconds,
  clipCostUsd,
  maxClipSeconds,
  minClipSeconds,
  modelFor,
  wanFrames,
} from './provider';

export { isAnimationConfigured } from './replicate';
export { isNovitaConfigured } from './novita';
export { isAtlasConfigured } from './atlas';

export type VideoProvider = 'replicate' | 'atlas' | 'novita';

export const VIDEO_PROVIDERS: readonly VideoProvider[] = [
  'replicate',
  'atlas',
  'novita',
];

/**
 * Le fournisseur du produit, tant que rien ne dit le contraire.
 *
 * Replicate et pas Novita : c'est lui qui rappelle, donc le seul dont un job
 * se résout sans que personne ne le surveille. Et c'est sa table de prix qui
 * est branchée à la facturation.
 */
export const DEFAULT_VIDEO_PROVIDER: VideoProvider = 'replicate';

/**
 * Qui anime, lu dans l'environnement.
 *
 * `VIDEO_PROVIDER` plutôt qu'un choix par plan comme la voix : ce qui décide
 * ici n'est pas ce que le client a payé mais ce qu'on est en train d'essayer.
 * Un nom inconnu retombe sur le défaut au lieu de faire tomber la génération —
 * une faute de frappe dans une variable ne doit pas coûter une vidéo.
 */
export function videoProviderFor(): VideoProvider {
  const nomme = read('VIDEO_PROVIDER');
  return VIDEO_PROVIDERS.includes(nomme as VideoProvider)
    ? (nomme as VideoProvider)
    : DEFAULT_VIDEO_PROVIDER;
}

/** Construit le client d'un fournisseur nommé, ou dit ce qui lui manque. */
export function createClientFor(provider: VideoProvider): VideoAnimator {
  if (provider === 'atlas') {
    if (!isAtlasConfigured()) {
      throw new AnimationNotConfiguredError('ATLAS_API_KEY');
    }
    return createAtlasAnimator();
  }

  if (provider === 'novita') {
    if (!isNovitaConfigured()) {
      throw new AnimationNotConfiguredError('NOVITA_API_KEY');
    }
    return createNovitaAnimator();
  }

  if (!isAnimationConfigured()) {
    throw new AnimationNotConfiguredError('REPLICATE_API_TOKEN');
  }
  return createReplicateAnimator();
}

/** L'entrée unique des plans animés. Le métier ne connaît que celle-ci. */
export function createAnimator(): VideoAnimator {
  return createClientFor(videoProviderFor());
}
