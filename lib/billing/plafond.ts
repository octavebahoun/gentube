import { and, eq, gt, gte, inArray, lte } from 'drizzle-orm';
import { billingCycles, creditLedger, videos } from '@/lib/db/schema';
import type { TenantDb } from '@/lib/db/tenant-db';
import { QUALITY_LABEL, STANDARD_CAP_BY_PLAN } from '@/lib/credits/pricing';

/**
 * Le plafond de Cinéma par cycle de facturation.
 *
 * **Pourquoi il existe.** `QUALITY_BY_PLAN` dit qui a le droit au palier ; ça
 * ne suffit pas à tenir la marge. Le Cinéma reste bénéficiaire à la seconde —
 * 140 FCFA vendus pour 25 de coût — mais c'est l'abonnement qui est vendu à
 * prix fixe, pas la seconde. Un quota Pro entièrement dépensé en Cinéma fait
 * tomber la marge du plan de 84 % à 69 %.
 *
 * **Pourquoi ici et pas dans `entitlements.ts`.** Un droit se lit une fois, à
 * la création de la vidéo. Un plafond se compte à chaque débit, sur une
 * fenêtre de temps : ce sont deux questions différentes, et mélanger les deux
 * ferait qu'un client pourrait créer dix vidéos Cinéma d'un coup — toutes
 * autorisées à la création — puis les valider une par une sans que rien ne
 * s'oppose à la onzième.
 *
 * **Ce qu'il ne fait pas.** Il ne bloque ni la création ni le storyboard : on
 * refuse au **débit**, le seul moment où l'argent bouge. Refuser plus tôt
 * demanderait de deviner ce que la vidéo coûtera avant d'avoir mesuré sa voix
 * off, donc de refuser des vidéos qui seraient passées.
 */

export class StandardCapReachedError extends Error {
  readonly statusCode = 402;

  constructor(
    readonly consomme: number,
    readonly plafond: number,
    readonly demande: number
  ) {
    super(
      `Le palier ${QUALITY_LABEL.standard} est plafonné à ${plafond} crédits ` +
        `par cycle. ${consomme} sont déjà consommés, cette vidéo en demande ` +
        `${demande}.`
    );
    this.name = 'StandardCapReachedError';
  }
}

export type ConsommationCinema = {
  /** Crédits de Cinéma déjà débités sur le cycle en cours, remboursements déduits. */
  consomme: number;
  /** Le plafond du plan, ou `null` s'il n'y en a pas. */
  plafond: number | null;
  /** Ce qu'il reste à dépenser, ou `null` sans plafond. */
  restant: number | null;
};

/**
 * Ce que ce tenant a déjà dépensé en Cinéma sur son cycle courant.
 *
 * Deux requêtes bornées plutôt qu'une jointure : `tenantDb` n'en fait pas, et
 * c'est voulu — chaque lecture porte son `WHERE tenant_id`, ce qu'une jointure
 * écrite à la main perdrait à la première étourderie.
 *
 * Sans cycle courant, il n'y a pas de plafond à appliquer : le tenant n'a pas
 * d'abonnement, donc `assertQualityAllowed` lui a déjà refusé le palier. Ce
 * n'est pas un trou, c'est l'autre verrou qui parle en premier.
 */
export async function consommationCinema(
  tdb: TenantDb,
  { now = new Date() }: { now?: Date } = {}
): Promise<ConsommationCinema> {
  const cycle = await tdb.findFirst(
    billingCycles,
    and(lte(billingCycles.periodStart, now), gt(billingCycles.periodEnd, now)),
    { orderBy: [billingCycles.id] }
  );

  if (!cycle) return { consomme: 0, plafond: null, restant: null };

  const plafond = STANDARD_CAP_BY_PLAN[cycle.plan];
  if (plafond === null) return { consomme: 0, plafond: null, restant: null };

  /*
   * Les écritures vidéo du cycle, débits et remboursements. Bornée par la
   * fenêtre : un cycle fait trente jours, donc la liste reste de l'ordre des
   * vidéos produites dans le mois.
   */
  const ecritures = await tdb.findMany(
    creditLedger,
    and(
      inArray(creditLedger.reason, ['video_debit', 'video_refund']),
      gte(creditLedger.createdAt, cycle.periodStart),
      lte(creditLedger.createdAt, cycle.periodEnd)
    )
  );

  const idsVideo = [
    ...new Set(
      ecritures
        .map((ecriture) => ecriture.videoId)
        .filter((id): id is number => id !== null)
    ),
  ];
  if (idsVideo.length === 0) return { consomme: 0, plafond, restant: plafond };

  const cinema = await tdb.findMany(
    videos,
    and(inArray(videos.id, idsVideo), eq(videos.quality, 'standard'))
  );
  const enCinema = new Set(cinema.map((video) => video.id));

  /*
   * `-delta` : un débit est négatif, un remboursement positif. Les sommer tels
   * quels puis inverser fait qu'une vidéo échouée et remboursée ne pèse plus
   * sur le plafond — elle n'a rien coûté.
   */
  const consomme = ecritures
    .filter((ecriture) => ecriture.videoId !== null && enCinema.has(ecriture.videoId))
    .reduce((total, ecriture) => total - ecriture.delta, 0);

  return { consomme, plafond, restant: Math.max(0, plafond - consomme) };
}

/**
 * Refuse le débit qui ferait dépasser le plafond.
 *
 * À appeler **dans la transaction du débit**, avant d'écrire : hors
 * transaction, deux validations simultanées passeraient toutes les deux le
 * contrôle avant que l'une ait écrit sa ligne.
 */
export async function assertSousLePlafond(
  tdb: TenantDb,
  credits: number,
  { now = new Date() }: { now?: Date } = {}
): Promise<void> {
  const { consomme, plafond } = await consommationCinema(tdb, { now });
  if (plafond === null) return;
  if (consomme + credits > plafond) {
    throw new StandardCapReachedError(consomme, plafond, credits);
  }
}
