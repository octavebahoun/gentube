import { and, eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { jobs, shots, videos, type Job, type Video } from '@/lib/db/schema';
import { getProject } from '@/lib/projects';
import { getVideo } from '@/lib/videos';
import { assetKey, createAssetStore, type AssetStore } from '@/lib/storage';
import { listShots } from '@/lib/storyboard/service';
import {
  rendersOwnContent,
  toHyperframesStoryboard,
} from '@/lib/storyboard/render';
import { findSound } from '@/lib/sounds';
import { StoryboardError } from '@/lib/storyboard/service';
import { materialize } from './materialize';
import {
  RenderError,
  createRenderEngine,
  type RenderEngine,
  type RenderState,
} from './lambda';

/**
 * L'étape montage — la dernière avant la publication.
 *
 * Elle est en **deux temps**, et ce n'est pas un raffinement : Lambda rend en
 * morceaux parallèles pendant plusieurs minutes, et aucune requête HTTP ne
 * doit attendre ça.
 *
 *   `startRender()`   matérialise le dossier, démarre l'exécution, retient son
 *                     identifiant, passe la vidéo en `rendering`.
 *   `collectRender()` relève l'état ; si c'est fini, descend le MP4, le range
 *                     sur R2 et passe la vidéo en `rendered`.
 *
 * Les deux sont **idempotents**. Appeler `startRender` deux fois ne démarre
 * pas deux rendus — le job existant est renvoyé tel quel. C'est ce qui
 * distingue un montage relancé par un utilisateur impatient d'un montage payé
 * deux fois.
 *
 * `jobs.external_id` porte l'identifiant d'exécution et il est **unique** en
 * base : un webhook rejoué résout exactement un job.
 */

export const RENDER_STEP = 'render';

export type RenderStatus = {
  video: Video;
  job: Job;
  /** Absent tant que l'exécution n'a pas été interrogée. */
  state?: RenderState;
  /** Clé R2 du MP4, une fois le montage fini. */
  outputUrl: string | null;
};

/**
 * Statuts depuis lesquels on accepte de monter.
 *
 * `generating` est le premier passage — les visuels sont faits. `rendering`
 * est une relance. `rendered` est refusé : remonter une vidéo déjà livrée
 * changerait le fichier sous un client qui l'a peut-être déjà publié.
 */
const RENDERABLE = new Set(['generating', 'rendering']);

export function assertRenderable(video: Video): void {
  if (RENDERABLE.has(video.status)) return;

  throw new StoryboardError(
    video.status === 'draft' || video.status === 'validated'
      ? 'This video has no visuals yet: generate the images and the animated ' +
        'shots before assembling it.'
      : `This video is ${video.status}; only a video whose visuals are ready ` +
        'can be assembled.',
    409
  );
}

/** Le job de montage de cette vidéo, s'il existe. */
async function findRenderJob(
  tdb: TenantDb,
  videoId: number
): Promise<Job | null> {
  return await tdb.findFirst(
    jobs,
    and(eq(jobs.videoId, videoId), eq(jobs.step, RENDER_STEP))
  );
}

export async function startRender(
  tdb: TenantDb,
  videoId: number,
  {
    engine,
    store,
  }: { engine?: RenderEngine; store?: AssetStore } = {}
): Promise<RenderStatus> {
  const video = await getVideo(tdb, videoId);
  assertRenderable(video);

  // Une relance ne redémarre rien : le job existant porte déjà une exécution
  // en cours, et en lancer une seconde paierait deux fois le même montage.
  const existing = await findRenderJob(tdb, videoId);
  if (existing && existing.status !== 'failed') {
    return { video, job: existing, outputUrl: video.outputUrl };
  }

  const storyboard = await listShots(tdb, videoId);
  if (storyboard.length === 0) {
    throw new StoryboardError('This video has no scene to assemble.', 409);
  }

  // Un plan sans média produirait un trou noir au milieu d'une vidéo déjà
  // payée. On refuse avant de dépenser du temps Lambda.
  //
  // Une carte ou un compteur n'a pas de média et n'en attend pas : son écran
  // est dessiné par la composition. Les compter comme manquants bloquait toute
  // vidéo qui en contient une, définitivement — l'étape image les saute, donc
  // relancer ne changeait rien.
  const missing = storyboard.filter(
    (shot) => !shot.assetUrl && !rendersOwnContent(shot.render)
  );
  if (missing.length > 0) {
    throw new StoryboardError(
      `${missing.length} scene${missing.length > 1 ? 's have' : ' has'} no ` +
        'visual yet. Generate them before assembling.',
      409
    );
  }

  const project = await getProject(tdb, video.projectId);
  const assets = store ?? createAssetStore();
  const renderer = engine ?? createRenderEngine();

  // Les pics du morceau vivent dans le catalogue, pas sur la vidéo, qui n'en
  // garde que la clé. Sans cette lecture, une scène qui demande `onBeat` garde
  // l'instant écrit — l'effet sort, simplement pas sur le temps fort.
  const musique = video.musicUrl ? await findSound(video.musicUrl) : null;

  const hyperframes = toHyperframesStoryboard(video, storyboard, {
    fallbackVoice: project.voiceId,
    music: musique
      ? { impacts: musique.impacts, durationS: musique.durationS }
      : null,
  });

  const prepared = await materialize(hyperframes, assets, {
    watermark: video.watermarked,
  });

  let started;
  try {
    // Le nom d'exécution devient l'identifiant du rendu et le préfixe de la
    // clé S3 de sortie. Un compteur de tentative le rend unique par relance :
    // Step Functions refuse deux exécutions du même nom.
    const attempt = (existing?.attempts ?? 0) + 1;
    started = await renderer.start({
      projectDir: prepared.dir,
      width: hyperframes.width,
      height: hyperframes.height,
      executionName: `gentube-${tdb.tenantId}-${videoId}-${attempt}`,
    });
  } finally {
    // Le dossier a fini son office dès que l'archive est partie sur S3. Le
    // laisser serait une fuite de disque qui ne se voit qu'une fois la machine
    // pleine.
    await prepared.cleanup();
  }

  const payload = {
    executionArn: started.executionArn,
    outputS3Uri: started.outputS3Uri,
    width: hyperframes.width,
    height: hyperframes.height,
    durationInSeconds: hyperframes.durationInSeconds,
  };

  const job = existing
    ? (
        await tdb.update(
          jobs,
          {
            externalId: started.renderId,
            status: 'running',
            payload,
            error: null,
            attempts: (existing.attempts ?? 0) + 1,
            updatedAt: new Date(),
          },
          eq(jobs.id, existing.id)
        )
      )[0]
    : (
        await tdb.insert(jobs, {
          videoId,
          step: RENDER_STEP,
          externalId: started.renderId,
          status: 'running',
          payload,
          attempts: 1,
        })
      )[0];

  const [updated] = await tdb.update(
    videos,
    { status: 'rendering', updatedAt: new Date() },
    eq(videos.id, videoId)
  );

  return { video: updated, job, outputUrl: updated.outputUrl };
}

export async function collectRender(
  tdb: TenantDb,
  videoId: number,
  {
    engine,
    store,
  }: { engine?: RenderEngine; store?: AssetStore } = {}
): Promise<RenderStatus> {
  const video = await getVideo(tdb, videoId);

  const job = await findRenderJob(tdb, videoId);
  if (!job) {
    throw new StoryboardError('This video has no assembly under way.', 409);
  }

  // Déjà relevé : on ne redescend pas un MP4 de S3 pour le remettre au même
  // endroit sur R2.
  if (job.status === 'succeeded' && video.outputUrl) {
    return { video, job, outputUrl: video.outputUrl };
  }

  const payload = (job.payload ?? {}) as { executionArn?: string };
  if (!payload.executionArn) {
    throw new RenderError(
      `Render job ${job.id} carries no execution to follow.`,
      500
    );
  }

  const renderer = engine ?? createRenderEngine();
  const state = await renderer.state(payload.executionArn);

  if (state.status === 'running') {
    return { video, job, state, outputUrl: video.outputUrl };
  }

  if (state.status === 'failed' || !state.output) {
    const [failedJob] = await tdb.update(
      jobs,
      {
        status: 'failed',
        error:
          state.errors.join(' | ').slice(0, 2_000) ||
          'The render ended without producing a file.',
        updatedAt: new Date(),
      },
      eq(jobs.id, job.id)
    );
    // La vidéo reste `rendering` et non `failed` : les crédits sont déjà
    // débités, les visuels existent, et une relance ne repaie rien. La
    // marquer `failed` fermerait la porte à la reprise.
    return { video, job: failedJob, state, outputUrl: null };
  }

  const assets = store ?? createAssetStore();
  const mp4 = await renderer.download(state.output.s3Uri);

  const key = await assets.put(
    assetKey(tdb.tenantId, 'videos', String(videoId), 'render', 'final.mp4'),
    mp4,
    'video/mp4'
  );

  const [succeededJob] = await tdb.update(
    jobs,
    {
      status: 'succeeded',
      error: null,
      payload: { ...payload, costUsd: state.costUsd, bytes: mp4.length },
      updatedAt: new Date(),
    },
    eq(jobs.id, job.id)
  );

  const [updated] = await tdb.update(
    videos,
    { status: 'rendered', outputUrl: key, updatedAt: new Date() },
    eq(videos.id, videoId)
  );

  // Les plans sont finis eux aussi : le montage est le dernier consommateur
  // de leurs assets.
  await tdb.update(
    shots,
    { status: 'ready', updatedAt: new Date() },
    eq(shots.videoId, videoId)
  );

  return { video: updated, job: succeededJob, state, outputUrl: key };
}
