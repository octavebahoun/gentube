/**
 * Contrat de stockage des assets.
 *
 * Chaque octet généré — voix off, image, clip, MP4 final — vit sur Cloudflare
 * R2 sous une clé qui COMMENCE par l'id du tenant. Ce préfixe est la moitié
 * stockage de l'isolation tenant : une URL signée fuit un objet, jamais le
 * dossier d'un voisin.
 *
 * Ce fichier porte l'interface et les clés ; l'implémentation R2 vit dans
 * `./r2`. Le découpage tient à ceci : la règle qui ne doit jamais plier — le
 * préfixe tenant — est imposée dans une fonction unique plutôt qu'à chaque
 * site d'appel, et elle reste vraie quel que soit le fournisseur derrière.
 */

export interface AssetStore {
  /** Stocke les octets et renvoie la clé par laquelle les relire. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  /**
   * Relit les octets d'un objet.
   *
   * Distinct de `signedUrl()` parce que les deux ne servent pas le même
   * appelant : une URL signée part vers un navigateur, `get()` sert le
   * serveur — le rendu, qui doit poser les médias sur un disque avant de
   * lancer Chrome. Passer par une URL signée là serait faire sortir l'octet
   * du réseau pour l'y faire rentrer.
   */
  get(key: string): Promise<Buffer>;
  /** URL à durée de vie courte pour lire un objet. */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export class StorageNotConfiguredError extends Error {
  readonly statusCode = 503;

  constructor(missing: string[] = []) {
    super(
      missing.length > 0
        ? `Asset storage is not configured on this instance: ${missing.join(', ')} ` +
            'are missing. Voice-over, image and video generation all depend on it.'
        : 'Asset storage is not configured on this instance. Voice-over, image ' +
            'and video generation all depend on it.'
    );
    this.name = 'StorageNotConfiguredError';
  }
}

export class InvalidAssetKeyError extends Error {
  constructor(key: string) {
    super(`Refusing an asset key outside its tenant prefix: ${key}`);
    this.name = 'InvalidAssetKeyError';
  }
}

const SEGMENT = /^[a-zA-Z0-9._-]+$/;
/**
 * `.` et `..` matchent SEGMENT — le point est un caractère légitime dans un
 * nom de fichier — donc ils sont exclus par nom. Manquer ceci est la façon
 * dont `7/../8/secret.mp3` devient une clé d'apparence valide pour le tenant 7.
 */
const TRAVERSAL = new Set(['.', '..']);

/**
 * Construit `<tenantId>/<parties…>`, en rejetant tout ce qui pourrait en sortir.
 * Un path traversal dans une clé d'objet est la façon pour un tenant de lire
 * les assets d'un autre.
 */
export function assetKey(tenantId: number, ...parts: string[]): string {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new InvalidAssetKeyError(`tenant ${tenantId}`);
  }
  if (parts.length === 0) {
    throw new InvalidAssetKeyError('<empty>');
  }
  for (const part of parts) {
    if (!SEGMENT.test(part) || TRAVERSAL.has(part)) {
      throw new InvalidAssetKeyError(parts.join('/'));
    }
  }
  return [tenantId, ...parts].join('/');
}

/** Vrai quand une clé appartient à ce tenant. Utilisé avant de signer quoi que ce soit. */
export function keyBelongsToTenant(key: string, tenantId: number): boolean {
  return key.startsWith(`${tenantId}/`) && !key.includes('..');
}

/**
 * Construit le store à partir de l'environnement.
 *
 * Lève `StorageNotConfiguredError` en nommant les variables manquantes, plutôt
 * que d'échouer plus tard sur un appel réseau opaque. Réexporté depuis `./r2`
 * pour que les appelants ne dépendent que de `@/lib/storage`.
 */
export { createAssetStore } from './r2';
