/**
 * Implémentation Cloudflare R2 du contrat `AssetStore`.
 *
 * R2 parle le protocole S3, donc on utilise le client AWS — mais rien d'autre
 * d'AWS : l'endpoint pointe sur Cloudflare, et la région `auto` est la seule
 * que R2 accepte.
 *
 * Deux règles ne plient jamais ici :
 *
 * 1. **Rien n'est public.** Les objets ne sont lisibles que par une URL signée
 *    à durée de vie courte. Un bucket ouvert annule l'isolation multi-tenant
 *    construite en base : deviner `7/voice/42/1.mp3` suffirait à écouter la
 *    narration d'un client.
 * 2. **La clé reste celle du tenant.** `assetKey()` produit `7/voice/…` et
 *    c'est ce qui est stocké en base. `R2_PREFIX` ne déplace que l'objet dans
 *    le bucket, jamais la clé applicative — sinon `keyBelongsToTenant()`
 *    cesserait de protéger quoi que ce soit.
 *
 * Variables lues :
 *
 *   R2_ACCOUNT_ID          identifiant de compte Cloudflare
 *   R2_ACCESS_KEY_ID       jeton S3 du bucket
 *   R2_SECRET_ACCESS_KEY   son secret
 *   R2_BUCKET              nom du bucket
 *   R2_ENDPOINT            optionnel — déduit du compte s'il est absent
 *   R2_PREFIX              optionnel — préfixe racine quand le bucket est
 *                          partagé avec un autre projet (ex. `gentube`)
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  type AssetStore,
  InvalidAssetKeyError,
  StorageNotConfiguredError,
} from './index';

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  /** Vide quand le bucket est dédié à GenTube. */
  prefix: string;
};

/** URL signée par défaut : assez pour lire un asset, trop court pour le partager. */
export const DEFAULT_SIGNED_URL_SECONDS = 900;

/** R2 n'accepte que cette région. Ce n'est pas un choix. */
const R2_REGION = 'auto';

function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

/**
 * Un préfixe est un chemin, pas un nom de fichier : il peut contenir des
 * slashs, mais rien qui permette d'en sortir.
 */
function normalizePrefix(raw: string): string {
  const trimmed = raw.replace(/^\/+|\/+$/g, '');
  if (trimmed === '') return '';
  if (trimmed.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new InvalidAssetKeyError(`R2_PREFIX=${raw}`);
  }
  return trimmed;
}

export function r2Config(): R2Config {
  const accountId = read('R2_ACCOUNT_ID');
  const accessKeyId = read('R2_ACCESS_KEY_ID');
  const secretAccessKey = read('R2_SECRET_ACCESS_KEY');
  const bucket = read('R2_BUCKET');

  const missing = [
    ['R2_ACCOUNT_ID', accountId],
    ['R2_ACCESS_KEY_ID', accessKeyId],
    ['R2_SECRET_ACCESS_KEY', secretAccessKey],
    ['R2_BUCKET', bucket],
  ]
    .filter(([, value]) => value === '')
    .map(([name]) => name as string);

  if (missing.length > 0) {
    throw new StorageNotConfiguredError(missing);
  }

  // L'endpoint se déduit du compte. On accepte quand même la variable, parce
  // qu'un bucket derrière un domaine personnalisé ne suit pas cette forme.
  const endpoint =
    read('R2_ENDPOINT') || `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    prefix: normalizePrefix(read('R2_PREFIX')),
  };
}

/**
 * Refuse tout ce qui n'est pas une clé produite par `assetKey()`.
 *
 * `put()` et `signedUrl()` sont les deux seuls endroits où une chaîne devient
 * un objet réel : c'est ici qu'une clé bricolée à la main doit s'arrêter, pas
 * plus loin.
 */
function assertUsableKey(key: string): void {
  if (
    key === '' ||
    key.startsWith('/') ||
    key.includes('//') ||
    key.split('/').some((s) => s === '.' || s === '..')
  ) {
    throw new InvalidAssetKeyError(key);
  }
}

export class R2Store implements AssetStore {
  private readonly config: R2Config;
  private readonly client: S3Client;

  constructor(config: R2Config, client?: S3Client) {
    this.config = config;
    this.client =
      client ??
      new S3Client({
        region: R2_REGION,
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  /** Où l'objet vit réellement dans le bucket. La clé applicative, elle, ne bouge pas. */
  private objectKey(key: string): string {
    return this.config.prefix ? `${this.config.prefix}/${key}` : key;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    assertUsableKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.objectKey(key),
        Body: body,
        ContentType: contentType,
      })
    );
    // On renvoie la clé applicative, jamais une URL : une URL expire, une clé
    // non. C'est elle qui est stockée en base.
    return key;
  }

  async signedUrl(
    key: string,
    expiresInSeconds: number = DEFAULT_SIGNED_URL_SECONDS
  ): Promise<string> {
    assertUsableKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.objectKey(key),
      }),
      { expiresIn: expiresInSeconds }
    );
  }
}

/**
 * Construit le store à partir de l'environnement.
 *
 * Lève `StorageNotConfiguredError` en nommant les variables manquantes, plutôt
 * que d'échouer plus tard sur un appel réseau opaque.
 */
export function createAssetStore(): AssetStore {
  return new R2Store(r2Config());
}
