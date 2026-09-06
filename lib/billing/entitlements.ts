/**
 * Ce qu'un tenant a le droit de produire, selon ce qu'il paie.
 *
 * Deux verrous, pas un. L'essai est bridé sur le palier **et** filigrané ; un
 * abonné Starter est bridé sur le palier seul.
 *
 * Le palier est là où l'argent se joue : le Cinéma coûte quatre fois le
 * Full HD à produire — 0,04 $ contre 0,01 $ la seconde — et se vend trois fois
 * et demie le prix. Un quota Starter intégralement dépensé en Cinéma
 * rapporterait moins qu'il ne coûte une fois les autres postes comptés, d'où
 * la restriction : elle protège la marge, pas la qualité livrée.
 *
 * Le filigrane, lui, est la seule chose qui distingue une vidéo d'essai d'une
 * vidéo payée aux yeux du spectateur. Les deux concurrents directs vendent
 * « sans filigrane » comme fonctionnalité payante : c'est attendu sur ce
 * marché, personne ne le lit comme une mutilation.
 */

import type { Plan, Quality } from '@/lib/db/schema';
import {
  QUALITY_BY_PLAN,
  QUALITY_LABEL,
  TRIAL_QUALITY,
} from '@/lib/credits/pricing';
import type { TenantDb } from '@/lib/db/tenant-db';
import { getSubscription } from './checkout';

export type Entitlements = {
  /** Vrai quand un abonnement est actif ou en retard de paiement mais encore ouvert. */
  paid: boolean;
  /** Paliers que ce tenant peut demander. */
  qualities: Quality[];
  /** Le rendu portera un filigrane. */
  watermark: boolean;
};

const TRIAL: Entitlements = {
  paid: false,
  qualities: [TRIAL_QUALITY],
  watermark: true,
};

export async function getEntitlements(tdb: TenantDb): Promise<Entitlements> {
  const subscription = await getSubscription(tdb);
  // `past_due` reste servi : un paiement en retard n'est pas un impayé, et
  // couper la production au premier échec pousse le client chez le voisin.
  // `suspended` a épuisé ses réessais, `canceled` est parti : les deux
  // retombent sur l'essai.
  const paid =
    subscription?.status === 'active' || subscription?.status === 'past_due';
  if (!paid) return TRIAL;

  /*
   * Le plan décide du palier, et pas seulement le fait de payer. Sans cette
   * lecture, un Starter à 15 000 FCFA accéderait au Cinéma exactement comme un
   * Pro à 35 000 — l'écart de prix entre les deux plans ne reposerait plus sur
   * rien de mesurable.
   */
  const plan = (subscription?.plan ?? 'starter') as Plan;
  return {
    paid: true,
    qualities: QUALITY_BY_PLAN[plan] ?? QUALITY_BY_PLAN.starter,
    watermark: false,
  };
}

export class QualityNotAllowedError extends Error {
  readonly statusCode = 402;

  constructor(readonly quality: Quality) {
    super(
      `Le palier ${QUALITY_LABEL[quality]} demande un plan qui l'inclut.`
    );
    this.name = 'QualityNotAllowedError';
  }
}

/** À appeler avant de créer ou de modifier une vidéo. */
export async function assertQualityAllowed(
  tdb: TenantDb,
  quality: Quality
): Promise<void> {
  const { qualities } = await getEntitlements(tdb);
  if (!qualities.includes(quality)) {
    throw new QualityNotAllowedError(quality);
  }
}
