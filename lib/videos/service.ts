import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantDb } from '@/lib/db/tenant-db';
import {
  creditLedger,
  jobs,
  shots,
  videos,
  type Video,
} from '@/lib/db/schema';
import { PIPELINES, getProject } from '@/lib/projects';
import { assertResolutionAllowed } from '@/lib/billing/entitlements';

/**
 * Videos — a title, a theme, and the storyboard that will be generated from it.
 *
 * A video is editable only while it is a `draft`. Past that point credits have
 * been charged and a pipeline is running or has run, so its shape is history
 * rather than configuration.
 */

export class VideoError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'VideoError';
    this.statusCode = statusCode;
  }
}

export const VIDEO_TITLE_MAX = 200;
export const VIDEO_THEME_MAX = 4_000;
export const RESOLUTIONS = ['480p', '720p'] as const;

const title = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z
    .string()
    .min(1, 'Video title is required.')
    .max(VIDEO_TITLE_MAX, `Title is limited to ${VIDEO_TITLE_MAX} characters.`)
);

const theme = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().max(VIDEO_THEME_MAX).nullable().optional()
);

/** Un override vide signifie « hériter du défaut du projet », c.-à-d. null. */
const pipelineOverride = z.preprocess(
  (value) => (value === '' || value === 'inherit' ? null : value),
  z.enum(PIPELINES).nullable().optional()
);

export const videoInputSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  title,
  theme,
  resolution: z.enum(RESOLUTIONS).optional(),
  pipelineOverride,
});

export const videoUpdateSchema = videoInputSchema
  .omit({ projectId: true })
  .partial();

export type VideoInput = z.input<typeof videoInputSchema>;
export type VideoUpdate = z.input<typeof videoUpdateSchema>;

/** Seul un brouillon peut être remodelé ; tout le reste a été payé. */
export function assertDraft(video: Video): void {
  if (video.status !== 'draft') {
    throw new VideoError(
      `This video is ${video.status}: only a draft can still be edited.`,
      409
    );
  }
}

export async function getVideo(tdb: TenantDb, id: number): Promise<Video> {
  const video = Number.isInteger(id) ? await tdb.findById(videos, id) : null;
  if (!video) {
    throw new VideoError(`Video ${id} not found.`, 404);
  }
  return video;
}

export async function listVideos(
  tdb: TenantDb,
  projectId?: number
): Promise<Video[]> {
  return await tdb.findMany(
    videos,
    projectId === undefined ? undefined : eq(videos.projectId, projectId),
    { orderBy: [desc(videos.updatedAt), desc(videos.id)] }
  );
}

export async function createVideo(
  tdb: TenantDb,
  input: VideoInput
): Promise<Video> {
  const data = videoInputSchema.parse(input);

  // Lève 404 si le projet appartient à quelqu'un d'autre, pour qu'un
  // projectId forgé ne puisse pas accrocher une vidéo au projet d'un autre
  // tenant.
  await getProject(tdb, data.projectId);

  // Le 720p demande un abonnement actif. Vérifié ici et pas seulement dans le
  // formulaire : une requête forgée passerait à côté du choix affiché.
  await assertResolutionAllowed(tdb, data.resolution ?? '480p');

  const [video] = await tdb.insert(videos, {
    projectId: data.projectId,
    title: data.title,
    theme: data.theme ?? null,
    resolution: data.resolution ?? '480p',
    pipelineOverride: data.pipelineOverride ?? null,
    status: 'draft',
  });

  return video;
}

export async function updateVideo(
  tdb: TenantDb,
  id: number,
  input: VideoUpdate
): Promise<Video> {
  const data = videoUpdateSchema.parse(input);
  const video = await getVideo(tdb, id);
  assertDraft(video);

  if (data.resolution !== undefined) {
    await assertResolutionAllowed(tdb, data.resolution);
  }

  const patch: Record<string, unknown> = {};
  for (const field of ['title', 'theme', 'resolution', 'pipelineOverride'] as const) {
    if (data[field] !== undefined) patch[field] = data[field];
  }

  if (Object.keys(patch).length === 0) return video;

  const [updated] = await tdb.update(
    videos,
    { ...patch, updatedAt: new Date() },
    eq(videos.id, id)
  );
  return updated;
}

/**
 * Supprime un brouillon et son storyboard.
 *
 * Refusé dès que quelque chose a été facturé : une ligne de grand livre
 * pointant vers une vidéo supprimée laisserait de l'argent bougé pour une
 * raison que personne ne peut retrouver.
 */
export async function deleteVideo(tdb: TenantDb, id: number): Promise<Video> {
  const video = await getVideo(tdb, id);
  assertDraft(video);

  const charged = await tdb.count(creditLedger, eq(creditLedger.videoId, id));
  if (charged > 0 || video.creditsConsumed > 0) {
    throw new VideoError(
      'This video has already consumed credits and cannot be deleted.',
      409
    );
  }

  return await tdb.transaction(async (tx) => {
    await tx.delete(shots, eq(shots.videoId, id));
    await tx.delete(jobs, eq(jobs.videoId, id));
    const [deleted] = await tx.delete(videos, eq(videos.id, id));
    return deleted;
  });
}
