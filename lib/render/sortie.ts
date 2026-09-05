import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { videos, type Shot, type Video } from '@/lib/db/schema';
import { getVideo } from '@/lib/videos';
import { assetKey, createAssetStore, type AssetStore } from '@/lib/storage';
import { StoryboardError, listShots } from '@/lib/storyboard/service';
import { rendersOwnContent, toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from './composition';

/**
 * Le dernier maillon : la vidéo devient un fichier.
 *
 * Tout le reste existait — le storyboard, la voix, les images, les crédits
 * débités, les états `rendering` et `rendered`, la colonne `outputUrl` pour la
 * clé du MP4. Il manquait l'étape qui les joint, et l'application s'arrêtait
 * juste avant le moteur : rien dans `app/` ne l'appelait.
 *
 * Les octets descendent par `store.get()` et non par une URL signée. Le
 * commentaire de `AssetStore` le disait déjà : une URL signée part vers un
 * navigateur, `get()` sert le serveur — qui doit poser les médias sur un
 * disque avant de lancer Chrome.
 */

export type RenderResult = {
  /** La clé R2 du MP4. */
  key: string;
  durationInSeconds: number;
  /** Secondes de machine. C'est ce qu'une file aurait à prévoir. */
  tookSeconds: number;
};

/** La qualité passée à hyperframes. `draft` pour les essais, `final` sinon. */
export type RenderQuality = 'draft' | 'final';

const RENDER_TIMEOUT_MS = 15 * 60 * 1000;

export function assertRenderable(video: Video): void {
  if (video.status === 'draft') {
    throw new StoryboardError(
      'This video is still a draft. Validate the storyboard first.',
      409
    );
  }
  if (video.status === 'published') {
    throw new StoryboardError('This video is already published.', 409);
  }
}

/**
 * Un plan est prêt quand il a de quoi s'afficher **et** de quoi se faire
 * entendre.
 *
 * Une scène qui dessine son propre écran — une carte, un compteur, un
 * graphique — n'a pas d'image, et c'est normal : c'est elle l'image. Lui
 * réclamer un `assetUrl` refuserait la vidéo entière pour une scène qui va
 * très bien.
 */
function assertShotsReady(storyboard: Shot[]): void {
  if (storyboard.length === 0) {
    throw new StoryboardError('This storyboard has no scene to render.', 409);
  }
  const sans = storyboard.filter(
    (shot) => !shot.assetUrl && !rendersOwnContent(shot.render)
  );
  if (sans.length > 0) {
    throw new StoryboardError(
      `${sans.length} scene(s) have no visual yet: ${sans
        .map((shot) => shot.order)
        .join(', ')}. Generate the visuals first.`,
      409
    );
  }
  const muets = storyboard.filter((shot) => !shot.audioUrl);
  if (muets.length > 0) {
    throw new StoryboardError(
      `${muets.length} scene(s) have no voice-over yet: ${muets
        .map((shot) => shot.order)
        .join(', ')}.`,
      409
    );
  }
}

/** Pose un objet du magasin sur le disque, et rend le chemin relatif. */
async function poser(
  store: AssetStore,
  cle: string,
  dir: string,
  dossier: string,
  nom: string
): Promise<string> {
  const octets = await store.get(cle);
  const fichier = `${nom}${extname(cle) || '.bin'}`;
  mkdirSync(join(dir, dossier), { recursive: true });
  writeFileSync(join(dir, dossier, fichier), octets);
  return `${dossier}/${fichier}`;
}

/**
 * Lance hyperframes et attend le fichier.
 *
 * `--no-browser-gpu` : la machine de rendu n'a pas de GPU, et SwiftShader rend
 * la même image d'une exécution à l'autre. C'est aussi ce que la garde visuelle
 * emploie, donc ce qui sort ici est ce que les références montrent.
 */
function lancerHyperframes(
  dir: string,
  sortie: string,
  quality: RenderQuality
): Promise<void> {
  return new Promise((resolve, reject) => {
    const enfant = spawn(
      'npx',
      [
        'hyperframes', 'render', dir,
        '-o', sortie,
        '-q', quality,
        '--no-browser-gpu',
        '-w', '2',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );

    let plainte = '';
    enfant.stderr?.on('data', (bout) => {
      plainte += String(bout);
      // Le dernier kilo suffit à dire pourquoi : garder tout le flux de
      // progression ferait une erreur de plusieurs mégaoctets.
      if (plainte.length > 4000) plainte = plainte.slice(-4000);
    });

    const minuteur = setTimeout(() => {
      enfant.kill('SIGKILL');
      reject(new StoryboardError('The render took too long and was stopped.', 504));
    }, RENDER_TIMEOUT_MS);

    enfant.on('error', (erreur) => {
      clearTimeout(minuteur);
      reject(erreur);
    });
    enfant.on('close', (code) => {
      clearTimeout(minuteur);
      if (code === 0) return resolve();
      reject(
        new StoryboardError(
          `The renderer stopped with code ${code}. ${plainte.slice(-600)}`,
          500
        )
      );
    });
  });
}

/**
 * Monte la vidéo et remonte le fichier.
 *
 * L'état passe à `rendering` avant de partir et à `rendered` à l'arrivée : une
 * exécution interrompue laisse la trace de ce qu'elle faisait, plutôt qu'une
 * vidéo qui a l'air validée et qui n'a rien.
 */
export async function renderVideo(
  tdb: TenantDb,
  videoId: number,
  { store, quality = 'draft' }: { store?: AssetStore; quality?: RenderQuality } = {}
): Promise<RenderResult> {
  const video = await getVideo(tdb, videoId);
  assertRenderable(video);

  const storyboard = await listShots(tdb, videoId);
  assertShotsReady(storyboard);

  const assets = store ?? createAssetStore();
  const dir = mkdtempSync(join(tmpdir(), `gentube-rendu-${videoId}-`));
  const debut = Date.now();

  try {
    await tdb.update(
      videos,
      { status: 'rendering' as const, updatedAt: new Date() },
      eq(videos.id, videoId)
    );

    for (const part of ['style.css', 'hyperframes.json', 'vendor']) {
      cpSync(join(COMPOSITION_DIR, part), join(dir, part), { recursive: true });
    }

    // Les plans, avec leurs chemins réécrits en relatif : la page composée
    // pointe sur des fichiers du dossier, jamais sur une URL.
    const locaux: Shot[] = [];
    for (const shot of storyboard) {
      const assetUrl = shot.assetUrl
        ? await poser(assets, shot.assetUrl, dir, 'media', `scene-${shot.order}`)
        : null;
      const audioUrl = shot.audioUrl
        ? await poser(assets, shot.audioUrl, dir, 'voice', `scene-${shot.order}`)
        : null;
      locaux.push({ ...shot, assetUrl, audioUrl });
    }

    const musicUrl = video.musicUrl
      ? await poser(assets, video.musicUrl, dir, 'music', 'bed')
      : null;

    const storyboardHf = toHyperframesStoryboard({ ...video, musicUrl }, locaux);
    writeFileSync(
      join(dir, 'index.html'),
      composeHtml({ storyboard: storyboardHf, watermark: video.watermarked })
    );

    const fichier = join(dir, 'sortie.mp4');
    await lancerHyperframes(dir, fichier, quality);

    const key = await assets.put(
      assetKey(tdb.tenantId, 'videos', String(videoId), 'renders', `${Date.now()}.mp4`),
      readFileSync(fichier),
      'video/mp4'
    );

    await tdb.update(
      videos,
      { status: 'rendered' as const, outputUrl: key, updatedAt: new Date() },
      eq(videos.id, videoId)
    );

    return {
      key,
      durationInSeconds: storyboardHf.durationInSeconds,
      tookSeconds: Math.round((Date.now() - debut) / 100) / 10,
    };
  } catch (erreur) {
    await tdb.update(
      videos,
      { status: 'failed' as const, updatedAt: new Date() },
      eq(videos.id, videoId)
    );
    throw erreur;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
