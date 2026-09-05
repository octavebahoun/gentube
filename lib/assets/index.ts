import { and, asc, eq } from 'drizzle-orm';
import { clientAssets, shots, type ClientAsset, type Shot } from '@/lib/db/schema';
import type { TenantDb } from '@/lib/db/tenant-db';
import { assetKey, createAssetStore, type AssetStore } from '@/lib/storage';
import { createTranscriber, type Transcriber } from '@/lib/transcribe/whisper';

/**
 * Les fichiers que le client dépose, et ce qu'ils remplacent.
 *
 * **Le point de tout ce fichier.** GenTube n'avait qu'une entrée : un thème
 * écrit, et tout le reste généré. Trois cas d'usage sur quatre partent en fait
 * d'un fichier — des captures d'écran à commenter, une photo de produit à
 * animer, une vidéo déjà tournée à habiller.
 *
 * **Ce qu'il n'a pas fallu changer.** Les deux étapes payantes savent déjà
 * sauter un plan servi : `generateImages` passe son chemin quand
 * `sourceImageUrl` est renseigné, `submitClips` quand `assetUrl` l'est. Lier
 * un fichier client, c'est donc écrire dans ces deux colonnes — et le moteur
 * ne voit aucune différence entre une image payée et une image déposée.
 *
 * C'est aussi ce qui rend la chose sûre : il n'existe pas de chemin où un plan
 * lié se remette à appeler un fournisseur.
 */

/** Ce qu'on accepte de stocker, par genre. */
export const MIMES_IMAGE = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MIMES_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

/**
 * Le plafond par fichier, en octets.
 *
 * Cent mégaoctets : une capture d'écran en fait deux, une vidéo d'une minute
 * en 1080p une trentaine. Au-delà on parle de rushes, et ce n'est pas ce que
 * ce produit monte.
 */
export const MAX_BYTES = 100 * 1024 * 1024;

export class AssetError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AssetError';
    this.statusCode = statusCode;
  }
}

export type AssetKind = 'image' | 'video';

export function kindOf(mimeType: string): AssetKind {
  if ((MIMES_IMAGE as readonly string[]).includes(mimeType)) return 'image';
  if ((MIMES_VIDEO as readonly string[]).includes(mimeType)) return 'video';

  throw new AssetError(
    `We cannot use a ${mimeType} file. Send a JPEG, PNG or WebP image, ` +
      'or an MP4, MOV or WebM video.'
  );
}

export type NouvelApport = {
  bytes: Buffer;
  mimeType: string;
  originalName?: string;
  /**
   * Mesures faites par le navigateur qui dépose.
   *
   * **Pourquoi pas ici.** Lire les dimensions d'un JPEG côté serveur demande un
   * décodeur natif (`sharp`), et la durée d'un MP4 demande ffprobe — deux
   * dépendances qui ne tiennent pas dans une fonction serverless. Le navigateur
   * connaît déjà les deux : une `<img>` a un `naturalWidth`, une `<video>` a
   * une `duration`.
   *
   * Elles ne servent qu'à l'affichage et au cadrage, jamais à la facturation :
   * un client qui mentirait sur la durée ne gagnerait rien.
   */
  width?: number;
  height?: number;
  durationS?: number;
};

/**
 * Dépose un fichier et l'enregistre.
 *
 * La clé suit le plan de nommage du dépôt (`docs/contrats.md`) mais sous
 * `imports/` et rattachée au **projet**, pas à la vidéo : les mêmes captures
 * resservent à la deuxième version de la vidéo, et les redéposer serait les
 * repayer en stockage.
 */
export async function uploadClientAsset(
  tdb: TenantDb,
  projectId: number,
  apport: NouvelApport,
  store?: AssetStore
): Promise<ClientAsset> {
  const kind = kindOf(apport.mimeType);

  if (apport.bytes.length === 0) {
    throw new AssetError('That file is empty.');
  }
  if (apport.bytes.length > MAX_BYTES) {
    throw new AssetError(
      `That file weighs ${(apport.bytes.length / 1e6).toFixed(0)} MB; the ` +
        `limit is ${MAX_BYTES / 1e6} MB.`,
      413
    );
  }

  const assets = store ?? createAssetStore();
  const extension = apport.mimeType.split('/')[1]?.replace('quicktime', 'mov');

  // `Date.now()` dans le nom : deux captures du même écran déposées à la suite
  // ne doivent pas s'écraser, et le client n'a aucune raison de renommer ses
  // fichiers pour nous.
  const key = await assets.put(
    assetKey(
      tdb.tenantId,
      'projects',
      String(projectId),
      'imports',
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
    ),
    apport.bytes,
    apport.mimeType
  );

  const [ligne] = await tdb.insert(clientAssets, [
    {
      projectId,
      kind,
      key,
      originalName: apport.originalName ?? null,
      mimeType: apport.mimeType,
      bytes: apport.bytes.length,
      width: apport.width ?? null,
      height: apport.height ?? null,
      durationS: apport.durationS ?? null,
    },
  ]);

  return ligne;
}

/** Ce que le client a déposé sur ce projet, du plus ancien au plus récent. */
export function listClientAssets(
  tdb: TenantDb,
  projectId: number
): Promise<ClientAsset[]> {
  return tdb.findMany(clientAssets, eq(clientAssets.projectId, projectId), {
    orderBy: [asc(clientAssets.id)],
  });
}

export async function getClientAsset(
  tdb: TenantDb,
  assetId: number
): Promise<ClientAsset> {
  const [asset] = await tdb.findMany(clientAssets, eq(clientAssets.id, assetId));
  if (!asset) throw new AssetError('That file does not exist.', 404);
  return asset;
}

/**
 * Transcrit la bande son d'une vidéo déposée.
 *
 * **L'audio arrive du navigateur, pas d'ici.** Extraire une piste d'un MP4
 * demande ffmpeg, qui n'existe pas dans une fonction serverless ; le
 * navigateur du client, lui, a le fichier et un décodeur complet. C'est
 * `extraireLaBandeSon` qui fait le travail, et cette fonction ne reçoit que
 * du WAV mono 16 kHz.
 *
 * **Elle n'écrit que si elle a compris quelque chose.** Un refus de Workers AI
 * — piste muette, format inattendu, quota — remonte à l'appelant, qui décide
 * d'abandonner sans casser le dépôt : le montage marche sans transcript, il
 * perd les sous-titres calés au mot.
 */
export async function transcribeClientAsset(
  tdb: TenantDb,
  assetId: number,
  audio: Buffer,
  transcriber: Transcriber = createTranscriber()
): Promise<ClientAsset> {
  const asset = await getClientAsset(tdb, assetId);
  if (asset.kind !== 'video') {
    throw new AssetError('Only a video has a soundtrack to transcribe.');
  }

  const sortie = await transcriber.transcribe(audio);

  const [ligne] = await tdb.update(
    clientAssets,
    { transcript: sortie.text, words: sortie.words },
    eq(clientAssets.id, assetId)
  );
  return ligne ?? { ...asset, transcript: sortie.text, words: sortie.words };
}

/**
 * Ce qu'un apport écrit sur le plan qu'il sert.
 *
 * Trois formes, et elles disent les trois cas d'usage :
 *
 * - **une image sur un plan fixe** — elle est la scène. `sourceImageUrl` et
 *   `assetUrl` pointent dessus, le plan est prêt. C'est la capture d'écran.
 * - **une image sur un plan animé** — elle est la matière première du clip.
 *   Seul `sourceImageUrl` est écrit ; `submitClips` fera le reste et c'est
 *   voulu. C'est la photo de produit qu'on anime.
 * - **une vidéo** — elle est le plan, entier. `assetUrl` pointe dessus et rien
 *   ne sera généré. C'est la séquence que le client a tournée.
 *
 * Une image ne peut pas servir de clip fini, et une vidéo ne peut pas servir
 * d'image de départ : `sourceImageUrl` part chez le modèle d'animation, qui
 * attend une image.
 */
export function liaisonPour(
  asset: Pick<ClientAsset, 'kind' | 'key'>,
  shotType: Shot['type']
): Partial<Shot> {
  if (asset.kind === 'video') {
    return {
      sourceImageUrl: null,
      assetUrl: asset.key,
      status: 'ready' as const,
    };
  }

  return shotType === 'image'
    ? { sourceImageUrl: asset.key, assetUrl: asset.key, status: 'ready' as const }
    : { sourceImageUrl: asset.key, assetUrl: null };
}

/**
 * Lie un fichier déposé à un plan.
 *
 * Après ça, aucune étape de génération ne touchera ce plan : `generateImages`
 * saute ce qui a un `sourceImageUrl`, `submitClips` ce qui a un `assetUrl`.
 * C'est le seul geste qui sépare une vidéo de captures d'une vidéo générée.
 */
export async function bindAssetToShot(
  tdb: TenantDb,
  shotId: number,
  assetId: number
): Promise<void> {
  const asset = await getClientAsset(tdb, assetId);
  const [shot] = await tdb.findMany(shots, eq(shots.id, shotId));
  if (!shot) throw new AssetError('That scene does not exist.', 404);

  // Une vidéo déposée est le plan entier : le type du plan suit le fichier,
  // sinon le rendu chercherait une image là où il y a un clip.
  const type = asset.kind === 'video' ? ('video' as const) : shot.type;

  /*
   * Le transcript se recopie ici, au moment de la liaison.
   *
   * Il a été fait au dépôt, parce que c'est le seul instant où l'audio existe
   * quelque part. Le plan, lui, arrive plus tard : c'est donc à la liaison que
   * les mots trouvent la colonne que la composition lit.
   *
   * **La narration du plan n'est écrasée que si elle est vide.** Un client qui
   * a écrit son propre texte le garde — le transcript dit ce qui est prononcé,
   * pas ce qu'il veut afficher. Les `words`, eux, remplacent : ils décrivent
   * la bande son du fichier, et aucun autre calage ne peut être juste.
   */
  const voix = asset.words
    ? {
        words: asset.words,
        ...(shot.narration?.trim() ? {} : { narration: asset.transcript ?? '' }),
      }
    : {};

  await tdb.update(
    shots,
    {
      sourceAssetId: asset.id,
      type,
      ...liaisonPour(asset, type),
      ...voix,
      updatedAt: new Date(),
    },
    and(eq(shots.id, shotId), eq(shots.videoId, shot.videoId))
  );
}
