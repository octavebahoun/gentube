import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantDb } from '@/lib/db/tenant-db';
import { projects, videos, type Pipeline, type Project } from '@/lib/db/schema';

/**
 * Projects — the unit that carries a style, a voice, a YouTube channel and a
 * default pipeline. Every video is created inside one and inherits its
 * configuration, so this is where a creator's editorial choices live.
 *
 * Everything here goes through `tenantDb()`: a project id from another tenant
 * reads as "not found", never as "forbidden", because the caller has no
 * business learning that it exists.
 */

export class ProjectError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ProjectError';
    this.statusCode = statusCode;
  }
}

export const PROJECT_NAME_MAX = 120;
export const VOICE_ID_MAX = 100;
export const YOUTUBE_CHANNEL_ID_MAX = 100;
/** The style prompt is prepended to every shot prompt, so it stays short. */
export const STYLE_PROMPT_MAX = 2_000;

/** Must stay in step with `pipelineEnum`; a test asserts it does. */
export const PIPELINES = ['image', 'video', 'mixed'] as const;

/** Trims, and reads an empty field as "cleared" rather than as an empty string. */
function nullableText(max: number) {
  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(max).nullable().optional()
  );
}

const name = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z
    .string()
    .min(1, 'Project name is required.')
    .max(PROJECT_NAME_MAX, `Project name is limited to ${PROJECT_NAME_MAX} characters.`)
);

export const projectInputSchema = z.object({
  name,
  defaultPipeline: z.enum(PIPELINES).optional(),
  voiceId: nullableText(VOICE_ID_MAX),
  youtubeChannelId: nullableText(YOUTUBE_CHANNEL_ID_MAX),
  stylePrompt: nullableText(STYLE_PROMPT_MAX),
});

/** Absent field means "leave it alone"; an empty one means "clear it". */
export const projectUpdateSchema = projectInputSchema.partial();

export type ProjectInput = z.input<typeof projectInputSchema>;
export type ProjectUpdate = z.input<typeof projectUpdateSchema>;

export type ProjectWithVideoCount = Project & { videoCount: number };

const EDITABLE_FIELDS = [
  'name',
  'defaultPipeline',
  'voiceId',
  'youtubeChannelId',
  'stylePrompt',
] as const;

/** Deleting a project is the one project action reserved to owners and admins. */
export function assertCanDeleteProject(user: { role: string }): void {
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw new ProjectError(
      'Only an owner or admin can delete a project.',
      403
    );
  }
}

/**
 * Projects of the tenant, most recently touched first, each with the number of
 * videos it holds.
 *
 * The counts are one indexed `COUNT` per project rather than a single grouped
 * query: `tenantDb()` has no `GROUP BY`, and adding one to the isolation
 * wrapper to save a few round trips on a list that holds a handful of rows
 * would be a poor trade. Loading every video row to tally them in memory would
 * be a worse one.
 */
export async function listProjects(
  tdb: TenantDb
): Promise<ProjectWithVideoCount[]> {
  const rows = await tdb.findMany(projects, undefined, {
    orderBy: [desc(projects.updatedAt), desc(projects.id)],
  });

  return await Promise.all(
    rows.map(async (project) => ({
      ...project,
      videoCount: await tdb.count(videos, eq(videos.projectId, project.id)),
    }))
  );
}

export async function getProject(tdb: TenantDb, id: number): Promise<Project> {
  const project = Number.isInteger(id) ? await tdb.findById(projects, id) : null;
  if (!project) {
    // Same answer whether the id is unknown or owned by someone else.
    throw new ProjectError(`Project ${id} not found.`, 404);
  }
  return project;
}

export async function createProject(
  tdb: TenantDb,
  input: ProjectInput
): Promise<Project> {
  const data = projectInputSchema.parse(input);

  const [project] = await tdb.insert(projects, {
    name: data.name,
    defaultPipeline: (data.defaultPipeline ?? 'mixed') as Pipeline,
    voiceId: data.voiceId ?? null,
    youtubeChannelId: data.youtubeChannelId ?? null,
    stylePrompt: data.stylePrompt ?? null,
  });

  return project;
}

export async function updateProject(
  tdb: TenantDb,
  id: number,
  input: ProjectUpdate
): Promise<Project> {
  const data = projectUpdateSchema.parse(input);
  const existing = await getProject(tdb, id);

  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (data[field] !== undefined) patch[field] = data[field];
  }

  if (Object.keys(patch).length === 0) return existing;

  const [updated] = await tdb.update(
    projects,
    { ...patch, updatedAt: new Date() },
    eq(projects.id, id)
  );
  return updated;
}

/**
 * Deletes an empty project.
 *
 * A project holding videos is refused rather than cascaded: those videos carry
 * consumed credits, rendered assets and published YouTube ids. Deleting them
 * behind a single click would destroy paid work and the record of what it cost.
 */
export async function deleteProject(
  tdb: TenantDb,
  id: number
): Promise<Project> {
  const project = await getProject(tdb, id);
  const videoCount = await tdb.count(videos, eq(videos.projectId, id));

  if (videoCount > 0) {
    throw new ProjectError(
      `"${project.name}" still holds ${videoCount} video${videoCount > 1 ? 's' : ''}. ` +
        'Delete or move them first.',
      409
    );
  }

  const [deleted] = await tdb.delete(projects, eq(projects.id, id));
  return deleted;
}
