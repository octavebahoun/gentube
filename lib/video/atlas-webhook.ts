import { createPublicKey, verify } from 'node:crypto';
import type { AssetStore } from '@/lib/storage';
import { AnimationError, type AnimationOutcome } from './contract';
import { atlasConfig, lire } from './atlas';
import {
  isFreshTimestamp,
  reply,
  resolveClipJob,
  type WebhookResult,
} from './clip-job';

/**
 * Callbacks Atlas Cloud → GenTube.
 *
 * Même contrat que Replicate, deux différences qui obligent à une route à
 * part :
 *
 * **La signature.** Atlas signe en **Ed25519** sur `<timestamp>.<corps>`, et
 * publie ses clés publiques en JWKS. Replicate signe en HMAC sur
 * `<id>.<timestamp>.<corps>` avec un secret partagé. Une route ne peut pas
 * deviner laquelle des deux elle reçoit — et essayer les deux serait pire,
 * puisqu'il suffirait alors de présenter la moins bien configurée.
 *
 * Atlas propose aussi un HMAC « legacy ». Il n'est pas implémenté ici, et
 * c'est délibéré : accepter deux schémas laisse choisir le plus faible à
 * celui qui frappe à la porte.
 *
 * **La charge.** L'identifiant est `session_id` et l'état vit sous
 * `payload.status`, avec un `timeout` que Replicate n'a pas.
 *
 * Tout le reste — retrouver le job, refuser un rejeu, rembourser, poser le
 * clip sur R2 — est dans `clip-job.ts`, partagé.
 */

const SIGNED_HEADERS = {
  signature: 'x-atlascloud-webhook-signature-ed25519',
  timestamp: 'x-atlascloud-webhook-timestamp',
  keyId: 'x-atlascloud-webhook-key-id',
} as const;

/** Une clé publique Ed25519 telle qu'Atlas la publie. */
export type AtlasJwk = {
  kty?: string;
  crv?: string;
  x?: string;
  kid?: string;
};

/**
 * Vérifie une signature Atlas contre un jeu de clés.
 *
 * Pure et sans réseau : la fonction qui décide reste testable sans rien
 * joindre. `x` est du base64url, la signature aussi — Node importe le JWK
 * directement, il n'y a pas de conversion à écrire.
 */
export function verifyAtlasSignature({
  timestamp,
  signature,
  keyId,
  rawBody,
  keys,
}: {
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  keyId?: string | null;
  rawBody: string;
  keys: AtlasJwk[];
}): boolean {
  if (!timestamp || !signature) return false;

  let signed: Buffer;
  try {
    signed = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  // Une signature Ed25519 fait 64 octets. Court-circuiter ici évite de
  // demander à Node de vérifier n'importe quoi.
  if (signed.length !== 64) return false;

  const message = Buffer.from(`${timestamp}.${rawBody}`);

  /*
   * Le `kid` de l'en-tête restreint les candidates, il ne les autorise pas :
   * c'est la signature qui décide. Un `kid` inconnu ou absent fait donc
   * essayer toutes les clés du JWKS plutôt que de rejeter — pendant une
   * rotation, les deux formes circulent.
   */
  const candidates = keys.filter((key) => !keyId || !key.kid || key.kid === keyId);
  const essais = candidates.length > 0 ? candidates : keys;

  return essais.some((jwk) => {
    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) return false;
    try {
      const publicKey = createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x },
        format: 'jwk',
      });
      return verify(null, message, publicKey, signed);
    } catch {
      // Une clé malformée dans le JWKS ne doit pas faire tomber les autres.
      return false;
    }
  });
}

/**
 * Le jeu de clés d'Atlas, gardé en mémoire.
 *
 * Le cache est là pour ne pas joindre Atlas à chaque rappel — quinze plans
 * d'une vidéo font quinze rappels en rafale. Il est court : une rotation ne
 * doit pas coûter une heure de 401, d'autant qu'Atlas ne redélivre qu'une
 * dizaine de fois.
 */
const CACHE_MS = 10 * 60_000;
let cache: { keys: AtlasJwk[]; at: number } | null = null;

/** Vide le cache. Pour les tests, et pour une rotation qu'on veut forcer. */
export function forgetAtlasKeys(): void {
  cache = null;
}

export function atlasJwksUrl(): string {
  return `${atlasConfig().baseUrl}/webhooks/jwks.json`;
}

export async function fetchAtlasKeys({
  now = Date.now(),
  fresh = false,
}: { now?: number; fresh?: boolean } = {}): Promise<AtlasJwk[]> {
  if (!fresh && cache && now - cache.at < CACHE_MS) return cache.keys;

  let response: Response;
  try {
    response = await fetch(atlasJwksUrl());
  } catch (cause) {
    throw new AnimationError(`Atlas JWKS is unreachable: ${cause}`, 503);
  }
  if (!response.ok) {
    throw new AnimationError(`Atlas JWKS ${response.status}.`, 503);
  }

  const body = (await response.json()) as { keys?: unknown };
  const keys = Array.isArray(body.keys) ? (body.keys as AtlasJwk[]) : [];
  if (keys.length === 0) {
    throw new AnimationError('Atlas JWKS carries no key.', 503);
  }

  cache = { keys, at: now };
  return keys;
}

type AtlasCallback = {
  session_id?: unknown;
  payload?: { status?: unknown; outputs?: unknown; error_code?: unknown };
  error?: unknown;
};

/**
 * Traduit un rappel Atlas dans le vocabulaire du contrat.
 *
 * `null` veut dire « terminée mais sans sortie » — une charge malformée, pas
 * un état. La lecture des états vit dans `atlas.ts` (`lire`), la même que
 * celle de `outcome()` : deux lectures divergentes du même vocabulaire
 * finiraient par se contredire sur un `timeout`.
 */
export function lireAtlas(callback: AtlasCallback): AnimationOutcome | null {
  const bloc = callback.payload ?? {};
  const error =
    typeof callback.error === 'string' && callback.error ? callback.error : undefined;

  try {
    return lire({ ...bloc, error: error ?? (bloc as { error?: unknown }).error });
  } catch {
    return null;
  }
}

export async function processAtlasWebhook(
  headers: Record<string, string>,
  rawBody: string,
  {
    jobId,
    store,
    now = Date.now(),
    keys,
  }: {
    jobId?: number | null;
    store?: AssetStore;
    now?: number;
    keys?: AtlasJwk[];
  } = {}
): Promise<WebhookResult> {
  const timestamp = headers[SIGNED_HEADERS.timestamp];
  if (!isFreshTimestamp(timestamp, { now })) {
    return reply(401, 'Stale or missing timestamp.');
  }

  const signature = headers[SIGNED_HEADERS.signature];
  const keyId = headers[SIGNED_HEADERS.keyId] ?? null;
  const args = { timestamp, signature, keyId, rawBody };

  let valid = verifyAtlasSignature({
    ...args,
    keys: keys ?? (await fetchAtlasKeys({ now })),
  });

  /*
   * Un seul rattrapage, et il compte : quand Atlas tourne ses clés, le cache
   * porte encore les anciennes et tous les rappels échoueraient jusqu'à son
   * expiration. Atlas ne redéliverait qu'une dizaine de fois — des clips payés
   * seraient perdus. On redemande donc le JWKS une fois avant de refuser.
   *
   * Une signature invalide ne coûte alors qu'une requête, pas une boucle :
   * `fresh` remplit le cache, et le rappel suivant repart de lui.
   */
  if (!valid && !keys) {
    valid = verifyAtlasSignature({
      ...args,
      keys: await fetchAtlasKeys({ now, fresh: true }),
    });
  }
  if (!valid) return reply(401, 'Invalid signature.');

  let callback: AtlasCallback;
  try {
    callback = JSON.parse(rawBody) as AtlasCallback;
  } catch {
    return reply(400, 'Body is not JSON.');
  }

  const externalId =
    typeof callback.session_id === 'string' ? callback.session_id : null;
  if (!externalId) return reply(400, 'Callback carries no session id.');

  const outcome = lireAtlas(callback);
  if (!outcome) return reply(400, 'Completed callback carries no output.');

  return await resolveClipJob(externalId, outcome, { jobId, store });
}
