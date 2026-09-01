import { AnimationNotConfiguredError, type VideoAnimator } from './contract';
import { createReplicateAnimator, isAnimationConfigured } from './replicate';

/**
 * L'entrée unique des plans animés.
 *
 * Un seul fournisseur aujourd'hui, deux modèles derrière lui (`provider.ts`).
 * Le métier n'appelle que `createAnimator()` : le jour où Replicate déçoit, ce
 * fichier change, et rien d'autre.
 */

export {
  ANIMATE_STEP,
  AnimationError,
  AnimationNotConfiguredError,
  type AnimationJobPayload,
  type AnimationOutcome,
  type AnimationRequest,
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
  modelFor,
  wanFrames,
} from './provider';
export { isAnimationConfigured } from './replicate';

export function createAnimator(): VideoAnimator {
  if (!isAnimationConfigured()) {
    throw new AnimationNotConfiguredError('REPLICATE_API_TOKEN');
  }
  return createReplicateAnimator();
}
