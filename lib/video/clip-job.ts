import { timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { jobs, shots } from '@/lib/db/schema';
import { assetKey, createAssetStore, type AssetStore } from '@/lib/storage';
import { refundVideo } from '@/lib/credits';
import { ANIMATE_STEP, type AnimationJobPayload, type AnimationOutcome } from './contract';

/**
 * Ce qui arrive à un plan quand son clip est prêt — quel que soit le
 * fournisseur qui l'annonce.
 *
 * **Pourquoi ce fichier existe.** Deux fournisseurs rappellent, et chacun
 * signe et met en forme sa charge à sa façon : Replicate en HMAC sur
 * `<id>.<timestamp>.<corps>`, Atlas en Ed25519 sur `<timestamp>.<corps>`, avec
 * des noms de champs qui n'ont rien en commun. Mais **ce qu'il faut en faire
 * est identique** : retrouver le job, refuser un rejeu, rembourser un échec,
 * descendre le clip sur R2 avant de dire le plan prêt.
 *
 * La partie propre au fournisseur reste chez lui (`webhook.ts`,
 * `atlas-webhook.ts`) ; tout ce qui touche à la base est ici, écrit une fois.
 * Dupliquer cette moitié-là aurait fait diverger le remboursement d'un
 * fournisseur à l'autre — et c'est de l'argent client.
 */

export type WebhookResult = {
  status: number;
  body: { ok: boolean; message: string };
};

export const reply = (status: number, message: string): WebhookResult => ({
  status,
  body: { ok: status < 400, message },
});

/** Cinq minutes : la tolérance recommandée par les deux fournisseurs. */
export const SIGNATURE_TOLERANCE_S = 300;

/** Comparaison à temps constant, pour ne pas fuir la signature attendue. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Rejette un webhook périmé ou daté du futur. Secondes depuis l'époque. */
export function isFreshTimestamp(
  timestamp: string | null | undefined,
  { toleranceS = SIGNATURE_TOLERANCE_S, now = Date.now() } = {}
): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  return Math.abs(now / 1000 - seconds) <= toleranceS;
}

/**
 * Pose l'issue d'une génération sur le plan qu'elle remplit.
 *
 * **N'est appelée qu'une fois la signature vérifiée.** Elle écrit en base et
 * rembourse : l'appeler sur une charge non authentifiée laisserait n'importe
 * qui vider un compte ou poser une URL arbitraire sur un plan.
 *
 * L'ordre des refus, et le code que chacun rend :
 *
 *  - job inconnu pour cette prédiction   — 200, il n'y a rien à faire
 *  - job déjà résolu                     — 200, un rejeu est un no-op
 *  - le job tourne une autre prédiction  — 409
 *
 * Les deux 200 sont volontaires : les deux fournisseurs redélivrent sur tout
 * ce qui n'est pas 2xx, une dizaine de fois. Un rappel authentique qu'on ne
 * sait pas traiter ne doit pas revenir en boucle pendant une heure.
 */
export async function resolveClipJob(
  externalId: string,
  outcome: AnimationOutcome,
  { jobId, store }: { jobId?: number | null; store?: AssetStore } = {}
): Promise<WebhookResult> {
  /**
   * Le job est nommé dans l'URL de rappel (`?job=<id>`), posée au moment de la
   * soumission. C'est ce qui ferme une course sinon imperdable : l'identifiant
   * de prédiction n'existe qu'une fois `submit()` revenu, et un rappel arrivé
   * dans cet intervalle ne trouverait aucune ligne à résoudre.
   *
   * Un paramètre d'URL n'est pas signé — mais le corps l'est, et la prédiction
   * qu'il nomme doit être celle que le job porte. Un identifiant soufflé ne
   * mène donc nulle part sans la clé.
   */
  const [job] = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.step, ANIMATE_STEP),
        jobId ? eq(jobs.id, jobId) : eq(jobs.externalId, externalId)
      )
    )
    .limit(1);

  // Authentique mais inconnu : une prédiction d'un autre environnement
  // partageant le compte du fournisseur. Redélivrer n'y changerait rien.
  if (!job) return reply(200, 'No clip job for this prediction.');

  if (job.externalId && job.externalId !== externalId) {
    return reply(409, `Job ${job.id} is not running this prediction.`);
  }

  if (job.status === 'succeeded' || job.status === 'failed') {
    return reply(200, 'Already resolved.');
  }

  /**
   * Trois issues, pas deux.
   *
   * Filtrer les événements à la soumission ne garantit pas qu'aucun rappel
   * intermédiaire n'arrive : un rejeu, un mauvais réglage côté fournisseur, un
   * statut inconnu d'une version future. Les traiter comme un échec définitif
   * marquait le job perdu **et remboursait la vidéo**, que `assertGeneratable`
   * refuse ensuite — un seul rappel `processing` détruisait tout.
   */
  if (outcome.status === 'pending') {
    return reply(200, 'Prediction is still running.');
  }

  const tdb = tenantDb(job.tenantId);
  const payload = (job.payload ?? {}) as Partial<AnimationJobPayload>;

  if (outcome.status === 'failed') {
    await tdb.update(
      jobs,
      {
        status: 'failed',
        error: outcome.error.slice(0, 2_000),
        updatedAt: new Date(),
      },
      eq(jobs.id, job.id)
    );

    // Une vidéo à qui il manque un plan n'est pas une vidéo. Les crédits ont
    // été débités à la validation : les laisser là ferait payer au client un
    // échec qui ne lui coûte rien chez le fournisseur. `refundVideo` marque
    // aussi la vidéo `failed`, et sa clé d'idempotence rend un rejeu inoffensif.
    await refundVideo(tdb, job.videoId);

    return reply(200, 'Clip failed, video refunded.');
  }

  if (payload.shotId === undefined || payload.order === undefined) {
    return reply(400, `Clip job ${job.id} does not say which shot it fills.`);
  }

  // Le clip vit sur un stockage temporaire chez le fournisseur — une heure
  // chez Replicate. Il doit passer sur R2 avant que le job soit dit réussi,
  // sinon on marque prêt un asset qui aura disparu au montage.
  const response = await fetch(outcome.videoUrl);
  if (!response.ok) {
    return reply(502, `Could not fetch the clip: ${response.status}.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());

  const assets = store ?? createAssetStore();
  const key = await assets.put(
    assetKey(
      job.tenantId,
      'videos',
      String(job.videoId),
      'clips',
      `scene-${payload.order}.mp4`
    ),
    bytes,
    'video/mp4'
  );

  await tdb.transaction(async (tx) => {
    await tx.update(
      shots,
      { assetUrl: key, status: 'ready' as const, updatedAt: new Date() },
      eq(shots.id, payload.shotId as number)
    );
    await tx.update(
      jobs,
      { status: 'succeeded', error: null, updatedAt: new Date() },
      eq(jobs.id, job.id)
    );
  });

  return reply(200, 'Clip stored.');
}
