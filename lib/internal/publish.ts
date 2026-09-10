import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { videos, publications, jobs } from '@/lib/db/schema';
import { VideoError, getVideo } from '@/lib/videos';
import {
  uploadVideo,
  YoutubeAuthError,
  YoutubeUploadError,
  type VideoUploadParams,
} from '@/lib/youtube';
import {
  checkQuotaAvailable,
  incrementQuota,
  QuotaExceededError,
  UPLOAD_COST,
} from '@/lib/youtube/quota';
import type { AssetStore } from '@/lib/storage';
import type { InternalDeps, InternalHeaders, InternalResult } from './handlers';
import { assertInternalAuth, InternalAuthError } from './auth';

export const PUBLISH_STEP = 'publish';

class PublishError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'PublishError';
    this.statusCode = statusCode;
  }
}

const publishSchema = z.object({
  tenantId: z.number().int().positive(),
  videoId: z.number().int().positive(),
  title: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(500).optional(),
  privacyStatus: z.enum(['public', 'private', 'unlisted']).optional(),
  categoryId: z.string().optional(),
});

function toResult(error: unknown): InternalResult {
  if (error instanceof InternalAuthError) {
    return { status: error.statusCode, body: { ok: false, message: error.message } };
  }

  if (error instanceof VideoError || error instanceof PublishError) {
    return { status: error.statusCode, body: { ok: false, message: error.message } };
  }

  if (error instanceof YoutubeAuthError || error instanceof YoutubeUploadError) {
    return { status: error.statusCode, body: { ok: false, message: error.message } };
  }

  if (error instanceof QuotaExceededError) {
    return { status: 429, body: { ok: false, message: error.message } };
  }

  console.error('[internal/publish] unexpected error:', error);
  return { status: 500, body: { ok: false, message: 'Internal error.' } };
}

function parsePublishRequest(rawBody: string): {
  tenantId: number;
  videoId: number;
  params: VideoUploadParams;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new PublishError('Invalid JSON body.', 400);
  }

  const result = publishSchema.safeParse(parsed);
  if (!result.success) {
    throw new PublishError(
      `Invalid request: ${result.error.errors.map((e) => e.message).join(', ')}`,
      400
    );
  }

  return {
    tenantId: result.data.tenantId,
    videoId: result.data.videoId,
    params: {
      title: result.data.title,
      description: result.data.description || '',
      tags: result.data.tags || [],
      privacyStatus: result.data.privacyStatus || 'public',
      categoryId: result.data.categoryId,
    },
  };
}

/**
 * Crée ou récupère le job de publication.
 */
async function getOrCreatePublishJob(tdb: TenantDb, videoId: number) {
  const existing = await tdb.findFirst(
    jobs,
    and(eq(jobs.videoId, videoId), eq(jobs.step, PUBLISH_STEP))
  );

  if (existing) {
    return existing;
  }

  const [job] = await tdb.insert(jobs, {
    videoId,
    step: PUBLISH_STEP,
    externalId: `publish:${videoId}`,
    status: 'running',
    attempts: 1,
  });

  return job;
}

/**
 * Publie une vidéo sur YouTube.
 * Vérifie le quota, télécharge la vidéo depuis R2, upload sur YouTube,
 * enregistre la publication.
 */
export async function handlePublish(
  headers: InternalHeaders,
  rawBody: string,
  deps: InternalDeps = {}
): Promise<InternalResult> {
  try {
    assertInternalAuth(headers);
    const { tenantId, videoId, params } = parsePublishRequest(rawBody);

    const tdb = deps.tdb ?? (await import('@/lib/db/tenant-db')).tenantDb(tenantId);
    const video = await getVideo(tdb, videoId);

    if (video.status !== 'rendered') {
      throw new PublishError(
        `Video must be rendered before publishing. Current status: ${video.status}`,
        409
      );
    }

    if (!video.outputUrl) {
      throw new PublishError('Video has no output file.', 409);
    }

    await checkQuotaAvailable(UPLOAD_COST);

    const job = await getOrCreatePublishJob(tdb, videoId);

    const [publication] = await tdb.insert(publications, {
      tenantId,
      videoId,
      status: 'uploading',
      quotaUnits: UPLOAD_COST,
    });

    await incrementQuota(UPLOAD_COST);

    const store = deps.store ?? (await import('@/lib/storage')).createAssetStore();
    const videoBuffer = await store.get(video.outputUrl);

    try {
      const youtubeVideoId = await uploadVideo(tdb, videoBuffer, params);

      await tdb.update(
        publications,
        {
          status: 'published',
          externalId: youtubeVideoId,
          publishedAt: new Date(),
          updatedAt: new Date(),
        },
        eq(publications.id, publication.id)
      );

      await tdb.update(
        videos,
        {
          status: 'published',
          youtubeVideoId,
          publishedAt: new Date(),
          updatedAt: new Date(),
        },
        eq(videos.id, videoId)
      );

      const [succeededJob] = await tdb.update(
        jobs,
        {
          status: 'succeeded',
          updatedAt: new Date(),
        },
        eq(jobs.id, job.id)
      );

      return {
        status: 200,
        body: {
          ok: true,
          step: PUBLISH_STEP,
          youtubeVideoId,
          job: {
            id: succeededJob.id,
            step: succeededJob.step,
            status: succeededJob.status,
          },
        },
      };
    } catch (error) {
      await tdb.update(
        publications,
        {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Upload failed.',
          updatedAt: new Date(),
        },
        eq(publications.id, publication.id)
      );

      await tdb.update(
        jobs,
        {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Upload failed.',
          attempts: job.attempts + 1,
          updatedAt: new Date(),
        },
        eq(jobs.id, job.id)
      );

      throw error;
    }
  } catch (error) {
    return toResult(error);
  }
}
