import { eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { shots, videos, type Shot, type Video } from '@/lib/db/schema';
import { getProject } from '@/lib/projects';
import { getVideo } from '@/lib/videos';
import { assetKey, createAssetStore, type AssetStore } from '@/lib/storage';
import {
  createImageClient,
  type ImageGenerator,
} from '@/lib/images/flux';
import { rendersOwnContent } from './render';
import { StoryboardError, listShots } from './service';

/**
 * L'étape image — la première qui dépense l'argent du client.
 *
 * Elle tourne **après** le débit, contrairement à la voix off : la parole
 * coûte des centimes et sert à mesurer les durées, les visuels coûtent le
 * prix de la vidéo. Une vidéo encore en `draft` n'a rien payé, donc elle est
 * refusée ici.
 *
 * Une fixe est générée pour **chaque** scène, animée comprise. Wan fait de
 * l'image-to-video : la fixe est la matière première du clip, pas une
 * alternative. C'est aussi ce qui rend le cadrage reproductible — on peut
 * relancer un clip sans rejouer le dé sur l'image.
 *
 * Les deux mêmes propriétés que la voix off, pour les mêmes raisons :
 *
 *  - **Reprise possible.** Chaque scène est écrite dès qu'elle réussit. Un
 *    échec à la scène 9 laisse les huit premières en place, et un second
 *    passage les saute au lieu de les repayer.
 *  - **Séquentiel.** Une douzaine de requêtes parallèles serait plus rapide et
 *    serait aussi le moyen le plus court de prendre un 429 chez un fournisseur
 *    qu'on ne contrôle pas.
 */

export type ImagesResult = {
  video: Video;
  shots: Shot[];
  /** Fixes produites par ce passage. Celles déjà en place ne comptent pas. */
  generated: number;
  skipped: number;
};

/**
 * Statuts depuis lesquels on accepte de générer.
 *
 * `validated` est le premier passage, `generating` une reprise. Tout le reste
 * est refusé en nommant la raison : `draft` n'a rien payé, et une vidéo déjà
 * rendue ne doit pas voir ses plans changer sous elle.
 */
const GENERATABLE = new Set(['validated', 'generating']);

export function assertGeneratable(video: Video): void {
  if (GENERATABLE.has(video.status)) return;

  throw new StoryboardError(
    video.status === 'draft'
      ? 'This video is still a draft: validate it first, so the credits are ' +
        'charged before we spend them at the provider.'
      : `This video is ${video.status}; only a validated video can have its ` +
        'visuals generated.',
    409
  );
}

/**
 * Prompt réellement envoyé au modèle.
 *
 * Le style du projet est recollé ici, et c'est le seul endroit où il l'est :
 * le prompt système du storyboard interdit au modèle de le répéter dans chaque
 * scène — « it is applied separately ». Ce fichier est ce « separately ». Sans
 * lui, le style du projet ne servait à rien.
 */
export function visualPrompt(
  shotPrompt: string,
  stylePrompt?: string | null
): string {
  const style = stylePrompt?.trim();
  const visual = shotPrompt.trim();
  return style ? `${visual}, ${style}` : visual;
}

export async function generateImages(
  tdb: TenantDb,
  videoId: number,
  {
    client,
    store,
  }: { client?: ImageGenerator; store?: AssetStore } = {}
): Promise<ImagesResult> {
  const video = await getVideo(tdb, videoId);
  assertGeneratable(video);

  const project = await getProject(tdb, video.projectId);
  const storyboard = await listShots(tdb, videoId);
  if (storyboard.length === 0) {
    throw new StoryboardError('This storyboard has no scene to illustrate.', 409);
  }

  // Résolus paresseusement : une vidéo dont toutes les fixes existent déjà ne
  // doit pas échouer parce que les clés fournisseur manquent.
  let generator = client;
  let assets = store;

  let generated = 0;
  let skipped = 0;

  if (video.status !== 'generating') {
    await tdb.update(
      videos,
      { status: 'generating', updatedAt: new Date() },
      eq(videos.id, videoId)
    );
  }

  for (const shot of storyboard) {
    if (shot.sourceImageUrl) {
      skipped += 1;
      continue;
    }

    // Une carte ou un compteur dessine son propre écran. Lui générer une
    // illustration, c'est payer une image que personne ne verra jamais.
    //
    // Mais la sauter ne suffit pas : sans passage à `ready`, elle reste
    // `pending` avec un `assetUrl` nul, et l'assemblage refuse toute la vidéo
    // en disant qu'une scène n'a pas de visuel. Elle en a un — c'est elle.
    if (rendersOwnContent(shot.render)) {
      if (shot.status !== 'ready') {
        await tdb.update(
          shots,
          { status: 'ready' as const, updatedAt: new Date() },
          eq(shots.id, shot.id)
        );
      }
      skipped += 1;
      continue;
    }

    generator ??= createImageClient();
    assets ??= createAssetStore();

    const image = await generator.generate({
      prompt: visualPrompt(shot.prompt, project.stylePrompt),
      ratio: video.ratio,
      resolution: video.resolution,
    });

    // Plan de nommage : docs/contrats.md §3 —
    // `<tenant>/videos/<video>/images/scene-<ordre>.jpg`. L'ordre, pas l'id :
    // une scène déplacée garde son fichier, le storyboard dit quel fichier
    // va où.
    const key = await assets.put(
      assetKey(
        tdb.tenantId,
        'videos',
        String(videoId),
        'images',
        `scene-${shot.order}.jpg`
      ),
      image.bytes,
      image.contentType
    );

    // Une scène fixe est finie ici. Une scène animée attend son clip, donc
    // `assetUrl` — ce que le rendu consomme — reste vide et son statut ne
    // passe pas à `ready`.
    await tdb.update(
      shots,
      {
        sourceImageUrl: key,
        ...(shot.type === 'image'
          ? { assetUrl: key, status: 'ready' as const }
          : {}),
        updatedAt: new Date(),
      },
      eq(shots.id, shot.id)
    );

    generated += 1;
  }

  return {
    video: await getVideo(tdb, videoId),
    shots: await listShots(tdb, videoId),
    generated,
    skipped,
  };
}
