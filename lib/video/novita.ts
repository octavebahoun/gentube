import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { shots, type Shot } from '@/lib/db/schema';
import { getVideo } from '@/lib/videos';
import { assetKey, createAssetStore, type AssetStore } from '@/lib/storage';
import { listShots } from '@/lib/storyboard/service';
import { rendersOwnContent } from '@/lib/storyboard/render';
import {
  AnimationError,
  AnimationNotConfiguredError,
  read,
  type AnimationOutcome,
  type AnimationRequest,
  type SubmittedAnimation,
  type VideoAnimator,
} from './contract';

/**
 * Novita, en interrogation — un chemin d'essai, à côté de Replicate.
 *
 * **Il ne remplace rien.** Replicate reste le fournisseur du produit :
 * `submitClips` rend la main tout de suite et son webhook pose le clip. Ce
 * fichier-ci sert à obtenir une génération vidéo tout de suite, depuis
 * l'écran, pour éprouver la cohérence de la chaîne — pas à facturer.
 *
 * Deux différences qui expliquent le reste du code :
 *
 *  - **Aucun webhook.** Novita se demande. On envoie, on interroge, on attend.
 *    L'action qui l'appelle bloque donc pendant toute la génération.
 *  - **Aucun crédit.** Rien n'est débité ici. La table des prix est celle de
 *    Wan chez Replicate ; brancher Seedance dessus ferait mentir la facture.
 *
 * L'appel lui-même est repris de `render/demo/build.ts`, qui a déjà servi.
 */

/**
 * Le modèle, surchargeable sans redéploiement.
 *
 * **Le défaut n'est pas un choix, c'est le dernier qui a répondu.** Novita
 * retire des routes : `seedance-v1-pro-i2v` rendait 404 après avoir marché, et
 * `wan-2.5-i2v-preview` a coûté 2,20 $ pour trois clips en partant en 1080P.
 * Minimax Hailuo 2.3 est celui qu'on essaie, à 0,19 $. Comme la liste bouge à
 * chaque semaine d'essais, elle vit dans l'environnement et pas ici.
 */
const MODEL = read('NOVITA_MODEL') ?? 'minimax-hailuo-2.3-i2v';
const BASE = 'https://api.novita.ai/v3/async';
const POLL_MS = 6_000;
const POLL_MAX = 90;

export function isNovitaConfigured(): boolean {
  return read('NOVITA_API_KEY') !== null;
}

function key(): string {
  const value = read('NOVITA_API_KEY');
  if (!value) throw new AnimationNotConfiguredError('NOVITA_API_KEY');
  return value;
}

/**
 * Envoie une image et rend l'identifiant de tâche.
 *
 * L'image part en base64 plutôt que par URL signée : c'est la forme qui a
 * déjà tourné, et elle évite d'exposer une adresse publique du magasin.
 */
async function soumettre(
  image: Buffer,
  prompt: string,
  seconds: number
): Promise<string> {
  const response = await fetch(`${BASE}/${MODEL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` },
    body: JSON.stringify({
      image: `data:image/jpeg;base64,${image.toString('base64')}`,
      prompt,
      duration: Math.max(3, Math.min(10, Math.round(seconds))),
      resolution: '480p',
      camera_fixed: false,
      generate_audio: false,
    }),
  });

  if (!response.ok) {
    throw new AnimationError(`Novita ${response.status}: ${await response.text()}`);
  }
  const { task_id: taskId } = (await response.json()) as { task_id?: string };
  if (!taskId) throw new AnimationError('Novita returned no task_id.');
  return taskId;
}

/**
 * Une interrogation, et une seule : l'état de la tâche à cet instant.
 *
 * Un incident réseau rend `pending` et non `failed` — ne pas savoir n'est pas
 * la même chose que savoir que c'est raté, et le GPU travaille toujours de son
 * côté. C'est ce que le contrat demande, et c'est ce qui permet à la boucle
 * ci-dessous de simplement réessayer.
 */
async function interroger(taskId: string): Promise<AnimationOutcome> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/task-result?task_id=${taskId}`, {
      headers: { Authorization: `Bearer ${key()}` },
    });
  } catch {
    return { status: 'pending' };
  }
  if (!response.ok) return { status: 'pending' };

  const data = (await response.json()) as {
    payload?: { task?: { status?: string; reason?: string }; videos?: { video_url?: string }[] };
  };
  const status = data.payload?.task?.status;

  if (status === 'TASK_STATUS_SUCCEED') {
    const url = data.payload?.videos?.[0]?.video_url;
    return url
      ? { status: 'succeeded', videoUrl: url }
      : { status: 'failed', error: 'Novita succeeded without a video URL.' };
  }
  if (status === 'TASK_STATUS_FAILED') {
    return { status: 'failed', error: data.payload?.task?.reason ?? 'no reason given' };
  }
  return { status: 'pending' };
}

/** Interroge jusqu'à ce que la tâche aboutisse, et rend l'URL du clip. */
async function attendre(taskId: string): Promise<string> {
  for (let essai = 0; essai < POLL_MAX; essai++) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    const etat = await interroger(taskId);
    if (etat.status === 'succeeded') return etat.videoUrl;
    if (etat.status === 'failed') {
      throw new AnimationError(`Novita failed: ${etat.error}`);
    }
  }
  throw new AnimationError('Novita took too long.', 504);
}

/**
 * Novita derrière le contrat commun.
 *
 * **`resolution: 'poll'` est le point important.** Novita ne rappelle jamais :
 * le brancher comme Replicate laisserait ses jobs `running` pour toujours, sans
 * erreur nulle part. Celui qui orchestre lit cette propriété et sait qu'il doit
 * redemander.
 *
 * `costUsd: 0` parce que rien n'est débité sur ce chemin. La table des prix est
 * celle de Wan chez Replicate : la réutiliser ici ferait mentir la facture, et
 * un zéro faux serait pire qu'un zéro assumé.
 */
export class NovitaAnimator implements VideoAnimator {
  readonly provider = 'novita';
  readonly resolution = 'poll' as const;

  get model(): string {
    return MODEL;
  }

  async submit(request: AnimationRequest): Promise<SubmittedAnimation> {
    const image = await fetch(request.imageUrl).then(async (r) =>
      Buffer.from(await r.arrayBuffer())
    );
    const taskId = await soumettre(image, request.prompt, request.durationS);
    return { externalId: taskId, model: MODEL, costUsd: 0 };
  }

  async outcome(externalId: string): Promise<AnimationOutcome> {
    return await interroger(externalId);
  }
}

export function createNovitaAnimator(): VideoAnimator {
  return new NovitaAnimator();
}

/**
 * Descend le clip.
 *
 * `curl` et non `fetch` : le client HTTP de Node part en ETIMEDOUT sur l'hôte
 * S3 de Novita, là où curl récupère quatre mégaoctets en cinq secondes. Le
 * diagnostic a coûté trois relances à quelqu'un, la ligne en coûte une.
 */
function descendre(url: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'gentube-clip-'));
  const fichier = join(dir, 'clip.mp4');
  try {
    execFileSync('curl', ['-sSfL', '--max-time', '180', '-o', fichier, url], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return readFileSync(fichier);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export type NovitaResult = { animated: number; skipped: number };

/**
 * Anime les plans vidéo d'une vidéo, un par un, et attend chacun.
 *
 * Un plan déjà animé est sauté : relancer ne repaie pas ce qui existe. Un plan
 * qui dessine son propre écran n'est pas à animer — il n'a pas d'image fixe à
 * donner au modèle.
 */
export async function animateWithNovita(
  tdb: TenantDb,
  videoId: number,
  { store }: { store?: AssetStore } = {}
): Promise<NovitaResult> {
  await getVideo(tdb, videoId);
  const storyboard = await listShots(tdb, videoId);
  const animes = storyboard.filter(
    (shot: Shot) => shot.type === 'video' && !rendersOwnContent(shot.render)
  );

  const assets = store ?? createAssetStore();
  let animated = 0;
  let skipped = 0;

  for (const shot of animes) {
    if (shot.assetUrl) {
      skipped += 1;
      continue;
    }
    if (!shot.sourceImageUrl) {
      throw new AnimationError(
        `Scene ${shot.order} has no still to animate. Generate the images first.`,
        409
      );
    }

    const image = await assets.get(shot.sourceImageUrl);
    const taskId = await soumettre(
      image,
      shot.prompt?.trim() || 'subtle cinematic motion, slow push-in, natural light',
      shot.durationS ?? 5
    );
    const url = await attendre(taskId);

    const cle = await assets.put(
      assetKey(tdb.tenantId, 'videos', String(videoId), 'clips', `scene-${shot.order}.mp4`),
      descendre(url),
      'video/mp4'
    );
    await tdb.update(
      shots,
      { assetUrl: cle, status: 'ready' as const, updatedAt: new Date() },
      eq(shots.id, shot.id)
    );
    animated += 1;
  }

  return { animated, skipped };
}
