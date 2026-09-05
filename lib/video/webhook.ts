import { createHmac } from 'node:crypto';
import type { AssetStore } from '@/lib/storage';
import {
  AnimationNotConfiguredError,
  read,
  type AnimationOutcome,
} from './contract';
import {
  isFreshTimestamp,
  reply,
  resolveClipJob,
  safeEqual,
  type WebhookResult,
} from './clip-job';

/**
 * Callbacks Replicate → GenTube : « ton clip est prêt ».
 *
 * L'ordre des contrôles est le même que pour les paiements, et pour la même
 * raison : **rien n'est écrit avant que la signature soit vérifiée**.
 *
 *  1. secret présent        — 503, la passerelle réessaiera
 *  2. horodatage frais      — 401
 *  3. signature valide      — 401 et pas une ligne écrite
 *
 * Ce qui suit — retrouver le job, refuser un rejeu, rembourser, poser le clip
 * — n'a rien de propre à Replicate et vit dans `clip-job.ts`, écrit une fois
 * pour les deux fournisseurs qui rappellent.
 */

/** Replicate signe comme Standard Webhooks : `<id>.<timestamp>.<corps>`. */
const SIGNED_HEADERS = {
  id: 'webhook-id',
  timestamp: 'webhook-timestamp',
  signature: 'webhook-signature',
} as const;

export { SIGNATURE_TOLERANCE_S, isFreshTimestamp, type WebhookResult } from './clip-job';

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

type Prediction = {
  id?: unknown;
  status?: unknown;
  output?: unknown;
  error?: unknown;
};

/**
 * Traduit une prédiction Replicate dans le vocabulaire du contrat.
 *
 * `null` veut dire « réussie mais sans sortie » — une charge malformée, pas un
 * état. `canceled` compte comme un échec : dans les deux cas le clip ne viendra
 * pas, et Replicate ne facture pas une exécution qui a échoué.
 */
export function lireReplicate(prediction: Prediction): AnimationOutcome | null {
  const status = prediction.status;
  const TERMINÉS = ['succeeded', 'failed', 'canceled'];

  if (typeof status !== 'string' || !TERMINÉS.includes(status)) {
    return { status: 'pending' };
  }

  if (status !== 'succeeded') {
    const error =
      typeof prediction.error === 'string' && prediction.error
        ? prediction.error
        : `Prediction ${status}.`;
    return { status: 'failed', error };
  }

  const videoUrl =
    typeof prediction.output === 'string'
      ? prediction.output
      : Array.isArray(prediction.output) &&
          typeof prediction.output[0] === 'string'
        ? prediction.output[0]
        : null;

  return videoUrl ? { status: 'succeeded', videoUrl } : null;
}

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

  const outcome = lireReplicate(prediction);
  if (!outcome) return reply(400, 'Succeeded prediction carries no output.');

  return await resolveClipJob(externalId, outcome, { jobId, store });
}
