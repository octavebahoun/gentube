import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { tenantDb, TenantScopeViolationError, type TenantDb } from '@/lib/db/tenant-db';
import { jobs, type Job } from '@/lib/db/schema';
import { VideoError, getVideo } from '@/lib/videos';
import { InsufficientCreditsError, refundVideo } from '@/lib/credits';
import { StandardCapReachedError } from '@/lib/billing/plafond';
import { StoryboardError, listShots } from '@/lib/storyboard/service';
import { assertPaid, finalizeVoiceover } from '@/lib/storyboard/voiceover';
import { assertGeneratable, generateImages } from '@/lib/storyboard/images';
import { submitClips } from '@/lib/storyboard/clips';
import { rendersOwnContent } from '@/lib/storyboard/render';
import { MEASURING_PROVIDER, type VoiceSynthesizer } from '@/lib/voice';
import type { ImageGenerator } from '@/lib/images/flux';
import { ANIMATE_STEP, type VideoAnimator } from '@/lib/video';
import type { AssetStore } from '@/lib/storage';
import {
  RENDER_STEP,
  collectRender,
  startRender,
} from '@/lib/render/service';
import type { RenderEngine } from '@/lib/render/lambda';
import { InternalAuthError, assertInternalAuth } from './auth';

/**
 * Les cinq étapes que n8n appelle. Chacune enveloppe une fonction métier
 * déjà écrite : pas de fournisseur ici, pas d'ordre ici.
 *
 * Voix et images n'écrivaient pas dans `jobs`. Le wrapper le fait, un job
 * par scène, comme le contrat. Clips et rendu l'écrivent déjà eux-mêmes :
 * on n'en rajoute pas une deuxième ligne.
 */

export const VOICEOVER_STEP = 'voiceover';
export const IMAGE_STEP = 'image';
export const MAX_JOB_ATTEMPTS = 3;

export type InternalHeaders = Headers | Record<string, string | null | undefined>;

export type InternalResult = {
  status: number;
  body: Record<string, unknown>;
};

export type InternalDeps = {
  voice?: VoiceSynthesizer;
  images?: ImageGenerator;
  animator?: VideoAnimator;
  engine?: RenderEngine;
  store?: AssetStore;
};

class InternalRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'InternalRequestError';
    this.statusCode = statusCode;
  }
}

const targetSchema = z.object({
  tenantId: z.number().int().positive(),
  videoId: z.number().int().positive(),
});

type ScenePayload = { shotId: number; order: number };

function toResult(error: unknown): InternalResult {
  if (
    error instanceof InternalAuthError ||
    error instanceof InternalRequestError ||
    error instanceof VideoError ||
    error instanceof StoryboardError ||
    error instanceof TenantScopeViolationError
  ) {
    const status =
      error instanceof TenantScopeViolationError ? 400 : error.statusCode;
    return { status, body: { ok: false, message: error.message } };
  }

  if (error instanceof InsufficientCreditsError) {
    return { status: 402, body: { ok: false, message: error.message } };
  }

  if (error instanceof StandardCapReachedError) {
    return { status: error.statusCode, body: { ok: false, message: error.message } };
  }

  if (
    error instanceof Error &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  ) {
    return {
      status: (error as { statusCode: number }).statusCode,
      body: { ok: false, message: error.message },
    };
  }

  console.error('[internal] unexpected error:', error);
  return { status: 500, body: { ok: false, message: 'Internal error.' } };
}

function parseTarget(rawBody: string): { tenantId: number; videoId: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InternalRequestError('Invalid JSON body.', 400);
  }
  const result = targetSchema.safeParse(parsed);
  if (!result.success) {
    throw new InternalRequestError('tenantId and videoId are required.', 400);
  }
  return result.data;
}

/**
 * Résolution et isolation stricte par tenant.
 *
 * **Contrat de sécurité** : un jeton interne valide ne donne pas accès à
 * toutes les données — chaque requête doit porter `tenantId` et `videoId`,
 * et cette fonction garantit que :
 * 1. Le `tenantDb(tenantId)` scope toutes les lectures/écritures au tenant déclaré
 * 2. `getVideo(tdb, videoId)` vérifie que la vidéo appartient bien à ce tenant
 * 3. Toute ressource liée (shots, jobs, etc.) est automatiquement scopée via `tdb`
 *
 * **Cross-tenant access impossible** : si `tenantId` ne correspond pas à la
 * vidéo, `getVideo` renvoie 404 (la ligne n'existe pas dans le scope).
 * Les lectures/écritures suivantes passent toutes par `tdb`, donc filtrent
 * automatiquement sur `tenant_id = tenantId` (cf. `lib/db/tenant-db.ts`).
 */
async function resolveTarget(rawBody: string): Promise<{
  tdb: TenantDb;
  videoId: number;
}> {
  const { tenantId, videoId } = parseTarget(rawBody);
  const tdb = tenantDb(tenantId);
  // Cette ligne est la barrière d'isolation : si videoId n'appartient pas
  // à tenantId, getVideo lève une erreur et la requête est refusée.
  await getVideo(tdb, videoId);
  return { tdb, videoId };
}

function jobPublic(job: Job) {
  return {
    id: job.id,
    step: job.step,
    externalId: job.externalId,
    status: job.status,
    attempts: job.attempts,
    error: job.error,
    payload: job.payload,
  };
}

function sceneExternalId(step: string, videoId: number, shotId: number): string {
  return `${step}:${videoId}:${shotId}`;
}

async function listStepJobs(
  tdb: TenantDb,
  videoId: number,
  step: string
): Promise<Job[]> {
  return await tdb.findMany(
    jobs,
    and(eq(jobs.videoId, videoId), eq(jobs.step, step))
  );
}

/**
 * Passe les jobs de la scène en `running` et compte la tentative. Les jobs
 * déjà `succeeded` ne bougent pas : une reprise ne repaie pas ce qui est fait.
 */
async function claimSceneJobs(
  tdb: TenantDb,
  videoId: number,
  step: string,
  scenes: ScenePayload[]
): Promise<Job[]> {
  const existing = await listStepJobs(tdb, videoId, step);
  const byShot = new Map(
    existing.map((job) => [(job.payload as ScenePayload | null)?.shotId, job])
  );

  const claimed: Job[] = [];
  for (const scene of scenes) {
    const current = byShot.get(scene.shotId);
    if (current?.status === 'succeeded') {
      claimed.push(current);
      continue;
    }
    if (current) {
      const [updated] = await tdb.update(
        jobs,
        {
          status: 'running' as const,
          attempts: current.attempts + 1,
          error: null,
          updatedAt: new Date(),
        },
        eq(jobs.id, current.id)
      );
      claimed.push(updated);
    } else {
      const [inserted] = await tdb.insert(jobs, {
        videoId,
        step,
        externalId: sceneExternalId(step, videoId, scene.shotId),
        status: 'running',
        payload: scene,
        attempts: 1,
      });
      claimed.push(inserted);
    }
  }
  return claimed;
}

async function settleSceneJobs(
  tdb: TenantDb,
  videoId: number,
  step: string,
  succeededShotIds: Set<number>,
  failure: { message: string; refund: boolean } | null
): Promise<void> {
  const rows = await listStepJobs(tdb, videoId, step);
  let exhausted = false;

  for (const job of rows) {
    const shotId = (job.payload as ScenePayload | null)?.shotId;
    if (shotId !== undefined && succeededShotIds.has(shotId)) {
      if (job.status !== 'succeeded') {
        await tdb.update(
          jobs,
          { status: 'succeeded' as const, error: null, updatedAt: new Date() },
          eq(jobs.id, job.id)
        );
      }
      continue;
    }

    if (!failure || job.status === 'succeeded') continue;

    await tdb.update(
      jobs,
      {
        status: 'failed' as const,
        error: failure.message.slice(0, 2_000),
        updatedAt: new Date(),
      },
      eq(jobs.id, job.id)
    );
    if (job.attempts >= MAX_JOB_ATTEMPTS) exhausted = true;
  }

  if (failure?.refund && exhausted) {
    await refundVideo(tdb, videoId);
  }
}

async function failRenderJob(
  tdb: TenantDb,
  videoId: number,
  message: string,
  refund: boolean
): Promise<void> {
  const existing = await tdb.findFirst(
    jobs,
    and(eq(jobs.videoId, videoId), eq(jobs.step, RENDER_STEP))
  );

  let attempts = 1;
  if (existing) {
    attempts = existing.attempts + 1;
    await tdb.update(
      jobs,
      {
        status: 'failed' as const,
        error: message.slice(0, 2_000),
        attempts,
        updatedAt: new Date(),
      },
      eq(jobs.id, existing.id)
    );
  } else {
    await tdb.insert(jobs, {
      videoId,
      step: RENDER_STEP,
      externalId: `render:${videoId}`,
      status: 'failed',
      error: message.slice(0, 2_000),
      attempts,
    });
  }

  if (refund && attempts >= MAX_JOB_ATTEMPTS) {
    await refundVideo(tdb, videoId);
  }
}

async function refundIfClipAttemptsExhausted(
  tdb: TenantDb,
  videoId: number
): Promise<void> {
  const failed = await tdb.findMany(
    jobs,
    and(
      eq(jobs.videoId, videoId),
      eq(jobs.step, ANIMATE_STEP),
      eq(jobs.status, 'failed')
    )
  );

  const counts = new Map<number, number>();
  for (const job of failed) {
    const shotId = (job.payload as ScenePayload | null)?.shotId;
    if (shotId === undefined) continue;
    counts.set(shotId, (counts.get(shotId) ?? 0) + 1);
  }

  if ([...counts.values()].some((n) => n >= MAX_JOB_ATTEMPTS)) {
    await refundVideo(tdb, videoId);
  }
}

export type StepState = 'succeeded' | 'running' | 'failed' | 'idle';

/**
 * Synthèse d'une étape pour n8n. `vacant` dit ce que signifie « aucun job » :
 * pour les clips, une vidéo en images fixes n'en a pas, et c'est fini.
 */
export function summarizeStep(
  jobList: Job[],
  step: string,
  vacant: StepState
): StepState {
  const rows = jobList.filter((job) => job.step === step);
  if (rows.length === 0) return vacant;
  const live = rows.some(
    (job) => job.status === 'running' || job.status === 'queued'
  );
  if (live) return 'running';
  if (rows.some((job) => job.status === 'failed')) return 'failed';
  if (rows.every((job) => job.status === 'succeeded')) return 'succeeded';
  return vacant;
}

async function loadJobs(tdb: TenantDb, videoId: number): Promise<Job[]> {
  return await tdb.findMany(jobs, eq(jobs.videoId, videoId));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldRefund(error: unknown): boolean {
  return toResult(error).status >= 500;
}

export async function handleVoice(
  headers: InternalHeaders,
  rawBody: string,
  deps: InternalDeps = {}
): Promise<InternalResult> {
  try {
    assertInternalAuth(headers);
    const { tdb, videoId } = await resolveTarget(rawBody);
    const video = await getVideo(tdb, videoId);
    assertPaid(video);

    const storyboard = await listShots(tdb, videoId);
    const scenes = storyboard
      .filter((shot) => shot.narration?.trim())
      .map((shot) => ({ shotId: shot.id, order: shot.order }));
    await claimSceneJobs(tdb, videoId, VOICEOVER_STEP, scenes);

    try {
      const result = await finalizeVoiceover(tdb, videoId, {
        client: deps.voice,
        store: deps.store,
      });
      const delivered = new Set(
        result.shots
          .filter(
            (shot) =>
              shot.audioUrl && shot.voiceProvider !== MEASURING_PROVIDER
          )
          .map((shot) => shot.id)
      );
      await settleSceneJobs(tdb, videoId, VOICEOVER_STEP, delivered, null);
      const jobList = await listStepJobs(tdb, videoId, VOICEOVER_STEP);
      return {
        status: 200,
        body: {
          ok: true,
          step: VOICEOVER_STEP,
          voiced: result.voiced,
          skipped: result.skipped,
          jobs: jobList.map(jobPublic),
        },
      };
    } catch (error) {
      const shots = await listShots(tdb, videoId);
      const delivered = new Set(
        shots
          .filter(
            (shot) =>
              shot.audioUrl && shot.voiceProvider !== MEASURING_PROVIDER
          )
          .map((shot) => shot.id)
      );
      await settleSceneJobs(tdb, videoId, VOICEOVER_STEP, delivered, {
        message: errorMessage(error),
        refund: shouldRefund(error),
      });
      throw error;
    }
  } catch (error) {
    return toResult(error);
  }
}

export async function handleImages(
  headers: InternalHeaders,
  rawBody: string,
  deps: InternalDeps = {}
): Promise<InternalResult> {
  try {
    assertInternalAuth(headers);
    const { tdb, videoId } = await resolveTarget(rawBody);
    const video = await getVideo(tdb, videoId);
    assertGeneratable(video);

    const storyboard = await listShots(tdb, videoId);
    const scenes = storyboard.map((shot) => ({
      shotId: shot.id,
      order: shot.order,
    }));
    await claimSceneJobs(tdb, videoId, IMAGE_STEP, scenes);

    try {
      const result = await generateImages(tdb, videoId, {
        client: deps.images,
        store: deps.store,
      });
      const done = new Set(
        result.shots
          .filter(
            (shot) => shot.sourceImageUrl || rendersOwnContent(shot.render)
          )
          .map((shot) => shot.id)
      );
      await settleSceneJobs(tdb, videoId, IMAGE_STEP, done, null);
      const jobList = await listStepJobs(tdb, videoId, IMAGE_STEP);
      return {
        status: 200,
        body: {
          ok: true,
          step: IMAGE_STEP,
          generated: result.generated,
          skipped: result.skipped,
          jobs: jobList.map(jobPublic),
        },
      };
    } catch (error) {
      const shots = await listShots(tdb, videoId);
      const done = new Set(
        shots
          .filter(
            (shot) => shot.sourceImageUrl || rendersOwnContent(shot.render)
          )
          .map((shot) => shot.id)
      );
      await settleSceneJobs(tdb, videoId, IMAGE_STEP, done, {
        message: errorMessage(error),
        refund: shouldRefund(error),
      });
      throw error;
    }
  } catch (error) {
    return toResult(error);
  }
}

export async function handleClips(
  headers: InternalHeaders,
  rawBody: string,
  deps: InternalDeps = {}
): Promise<InternalResult> {
  try {
    assertInternalAuth(headers);
    const { tdb, videoId } = await resolveTarget(rawBody);

    try {
      const result = await submitClips(tdb, videoId, {
        animator: deps.animator,
        store: deps.store,
      });
      const jobList = await listStepJobs(tdb, videoId, ANIMATE_STEP);
      return {
        status: 200,
        body: {
          ok: true,
          step: ANIMATE_STEP,
          submitted: result.submitted,
          skipped: result.skipped,
          jobs: jobList.map(jobPublic),
        },
      };
    } catch (error) {
      if (shouldRefund(error)) {
        await refundIfClipAttemptsExhausted(tdb, videoId);
      }
      throw error;
    }
  } catch (error) {
    return toResult(error);
  }
}

export async function handleRender(
  headers: InternalHeaders,
  rawBody: string,
  deps: InternalDeps = {}
): Promise<InternalResult> {
  try {
    assertInternalAuth(headers);
    const { tdb, videoId } = await resolveTarget(rawBody);

    try {
      const result = await startRender(tdb, videoId, {
        engine: deps.engine,
        store: deps.store,
      });
      return {
        status: 200,
        body: {
          ok: true,
          step: RENDER_STEP,
          videoStatus: result.video.status,
          job: jobPublic(result.job),
        },
      };
    } catch (error) {
      // Un 409 (pas encore de visuels) n'est pas une tentative de montage.
      // Compter ça dans `attempts` ferait rembourser une vidéo encore en cours.
      if (shouldRefund(error)) {
        await failRenderJob(tdb, videoId, errorMessage(error), true);
      }
      throw error;
    }
  } catch (error) {
    return toResult(error);
  }
}

export async function handleStatus(
  headers: InternalHeaders,
  rawBody: string,
  deps: InternalDeps = {}
): Promise<InternalResult> {
  try {
    assertInternalAuth(headers);
    const { tdb, videoId } = await resolveTarget(rawBody);

    const renderJob = await tdb.findFirst(
      jobs,
      and(eq(jobs.videoId, videoId), eq(jobs.step, RENDER_STEP))
    );
    if (renderJob?.status === 'running' || renderJob?.status === 'queued') {
      try {
        await collectRender(tdb, videoId, {
          engine: deps.engine,
          store: deps.store,
        });
      } catch (error) {
        console.error('[internal/status] collectRender failed:', error);
      }
    }

    const video = await getVideo(tdb, videoId);
    const jobList = await loadJobs(tdb, videoId);

    return {
      status: 200,
      body: {
        ok: true,
        videoId: video.id,
        videoStatus: video.status,
        outputUrl: video.outputUrl,
        steps: {
          voiceover: summarizeStep(jobList, VOICEOVER_STEP, 'idle'),
          image: summarizeStep(jobList, IMAGE_STEP, 'idle'),
          animate: summarizeStep(jobList, ANIMATE_STEP, 'succeeded'),
          render: summarizeStep(jobList, RENDER_STEP, 'idle'),
        },
        jobs: jobList.map(jobPublic),
      },
    };
  } catch (error) {
    return toResult(error);
  }
}
