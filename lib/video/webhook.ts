import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { jobs, shots } from '@/lib/db/schema';
import { assetKey, createAssetStore, type AssetStore } from '@/lib/storage';
import { refundVideo } from '@/lib/credits';
import {
  ANIMATE_STEP,
  AnimationNotConfiguredError,
  read,
  type AnimationJobPayload,
} from './contract';

/**
 * Callbacks Replicate → GenTube : « ton clip est prêt ».
 *
 * L'ordre des contrôles est le même que pour les paiements, et pour la même
 * raison : **rien n'est écrit avant que la signature soit vérifiée**.
 *
 *  1. secret présent                      — 503, la passerelle réessaiera
 *  2. horodatage frais                    — 401
 *  3. signature valide                    — 401 et pas une ligne écrite
 *  4. job connu pour cette prédiction     — 200, il n'y a rien à faire
 *  5. job déjà résolu                     — 200, un rejeu est un no-op
 *
 * Le 200 des deux derniers cas est volontaire : un webhook qu'on ne sait pas
 * traiter mais qui est authentique ne doit pas être redélivré en boucle.
 */

/** Replicate signe comme Standard Webhooks : `<id>.<timestamp>.<corps>`. */
const SIGNED_HEADERS = {
  id: 'webhook-id',
  timestamp: 'webhook-timestamp',
  signature: 'webhook-signature',
} as const;

/** Cinq minutes, la tolérance de la spécification. */
export const SIGNATURE_TOLERANCE_S = 300;

export type WebhookResult = {
  status: number;
  body: { ok: boolean; message: string };
};

const reply = (status: number, message: string): WebhookResult => ({
  status,
  body: { ok: status < 400, message },
});

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Vérifie la signature d'un webhook Replicate.
 *
 * Le secret arrive préfixé `whsec_` et **sa partie utile est du base64** : la
 * clé HMAC est l'octet décodé, pas la chaîne. Signer la chaîne donnerait un
 * digest stable et faux, qui ne rejetterait rien.
 *
 * L'en-tête peut porter plusieurs signatures séparées par des espaces, chacune
 * `v1,<base64>` — c'est ainsi qu'un secret se remplace sans coupure. Une seule
 * qui correspond suffit.
 */
export function verifyReplicateSignature({
  id,
  timestamp,
  signature,
  rawBody,
  secret,
}: {
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  rawBody: string;
  secret: string;
}): boolean {
  if (!id || !timestamp || !signature) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (key.length === 0) return false;

  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  return signature
    .split(' ')
    .map((part) => part.split(',', 2)[1])
    .some((candidate) => Boolean(candidate) && safeEqual(candidate, expected));
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

type Prediction = {
  id?: unknown;
  status?: unknown;
  output?: unknown;
  error?: unknown;
};

export async function processReplicateWebhook(
  headers: Record<string, string>,
  rawBody: string,
  {
    jobId,
    store,
    now = Date.now(),
  }: { jobId?: number | null; store?: AssetStore; now?: number } = {}
): Promise<WebhookResult> {
  const secret = read('REPLICATE_WEBHOOK_SECRET');
  if (!secret) throw new AnimationNotConfiguredError('REPLICATE_WEBHOOK_SECRET');

  const timestamp = headers[SIGNED_HEADERS.timestamp];
  if (!isFreshTimestamp(timestamp, { now })) {
    return reply(401, 'Stale or missing timestamp.');
  }

  const valid = verifyReplicateSignature({
    id: headers[SIGNED_HEADERS.id],
    timestamp,
    signature: headers[SIGNED_HEADERS.signature],
    rawBody,
    secret,
  });
  if (!valid) return reply(401, 'Invalid signature.');

  let prediction: Prediction;
  try {
    prediction = JSON.parse(rawBody) as Prediction;
  } catch {
    return reply(400, 'Body is not JSON.');
  }

  const externalId = typeof prediction.id === 'string' ? prediction.id : null;
  if (!externalId) return reply(400, 'Prediction carries no id.');

  /**
   * Le job est nommé dans l'URL de rappel (`?job=<id>`), posée au moment de la
   * soumission. C'est ce qui ferme une course sinon imperdable : l'identifiant
   * de prédiction n'existe qu'une fois `submit()` revenu, et un rappel arrivé
   * dans cet intervalle ne trouverait aucune ligne à résoudre.
   *
   * Un paramètre d'URL n'est pas signé — mais le corps l'est, et la prédiction
   * qu'il nomme doit être celle que le job porte. Un identifiant soufflé ne
   * mène donc nulle part sans le secret.
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
  // partageant le compte Replicate. Redélivrer n'y changerait rien.
  if (!job) return reply(200, 'No clip job for this prediction.');

  if (job.externalId && job.externalId !== externalId) {
    return reply(409, `Job ${job.id} is not running this prediction.`);
  }

  if (job.status === 'succeeded' || job.status === 'failed') {
    return reply(200, 'Already resolved.');
  }

  const tdb = tenantDb(job.tenantId);
  const payload = (job.payload ?? {}) as Partial<AnimationJobPayload>;
  const status = prediction.status;

  if (status !== 'succeeded') {
    // `canceled` compris : dans les deux cas le clip ne viendra pas, et
    // Replicate ne facture pas une exécution qui a échoué.
    await tdb.update(
      jobs,
      {
        status: 'failed',
        error:
          typeof prediction.error === 'string' && prediction.error
            ? prediction.error.slice(0, 2_000)
            : `Prediction ${String(status)}.`,
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

  const videoUrl =
    typeof prediction.output === 'string'
      ? prediction.output
      : Array.isArray(prediction.output) &&
          typeof prediction.output[0] === 'string'
        ? prediction.output[0]
        : null;

  if (!videoUrl) return reply(400, 'Succeeded prediction carries no output.');
  if (payload.shotId === undefined || payload.order === undefined) {
    return reply(400, `Clip job ${job.id} does not say which shot it fills.`);
  }

  // Le clip vit sur un stockage temporaire chez le fournisseur — une heure
  // chez Replicate. Il doit passer sur R2 avant que le job soit dit réussi,
  // sinon on marque prêt un asset qui aura disparu au montage.
  const response = await fetch(videoUrl);
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
