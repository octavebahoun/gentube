/**
 * Ce qu'un tenant a le droit de produire, selon qu'il paie ou non.
 *
 * L'essai n'est pas un plan bridé au hasard : il est bridé là où ça coûte
 * cher à produire et là où ça se voit. Le 720p coûte plus du double du 480p à
 * générer, et le filigrane est la seule chose qui distingue une vidéo d'essai
 * d'une vidéo payée aux yeux du spectateur.
 *
 * Les deux concurrents directs vendent « sans filigrane » comme fonctionnalité
 * payante : c'est attendu sur ce marché, personne ne le lit comme une
 * mutilation.
 */

import type { Resolution } from '@/lib/db/schema';
import { TRIAL_RESOLUTION } from '@/lib/credits/pricing';
import type { TenantDb } from '@/lib/db/tenant-db';
import { getSubscription } from './checkout';

export type Entitlements = {
  /** Vrai quand un abonnement est actif ou en retard de paiement mais encore ouvert. */
  paid: boolean;
  /** Résolutions que ce tenant peut demander. */
  resolutions: Resolution[];
  /** Le rendu portera un filigrane. */
  watermark: boolean;
};

const TRIAL: Entitlements = {
  paid: false,
  resolutions: [TRIAL_RESOLUTION],
  watermark: true,
};

const PAID: Entitlements = {
  paid: true,
  resolutions: ['480p', '720p'],
  watermark: false,
};

export async function getEntitlements(tdb: TenantDb): Promise<Entitlements> {
  const subscription = await getSubscription(tdb);
  // `past_due` reste servi : un paiement en retard n'est pas un impayé, et
  // couper la production au premier échec pousse le client chez le voisin.
  // `suspended` a épuisé ses réessais, `canceled` est parti : les deux
  // retombent sur l'essai.
  const paid =
    subscription?.status === 'active' || subscription?.status === 'past_due';
  return paid ? PAID : TRIAL;
}

export class ResolutionNotAllowedError extends Error {
  readonly statusCode = 402;

  constructor(readonly resolution: Resolution) {
    super(
      `Resolution ${resolution} needs an active plan. The trial produces ` +
        `${TRIAL_RESOLUTION} only.`
    );
    this.name = 'ResolutionNotAllowedError';
  }
}

/** À appeler avant de créer ou de modifier une vidéo. */
export async function assertResolutionAllowed(
  tdb: TenantDb,
  resolution: Resolution
): Promise<void> {
  const { resolutions } = await getEntitlements(tdb);
  if (!resolutions.includes(resolution)) {
    throw new ResolutionNotAllowedError(resolution);
  }
}
