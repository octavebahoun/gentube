import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantDb } from '@/lib/db/tenant-db';
import { projects, videos, type Pipeline, type Project } from '@/lib/db/schema';

/**
 * Projets — l'unité qui porte un style, une voix, une chaîne YouTube et un
 * pipeline par défaut. Chaque vidéo est créée dans l'un et hérite de sa
 * configuration, donc c'est ici que vivent les choix éditoriaux d'un créateur.
 *
 * Tout ici passe par `tenantDb()` : un id de projet venant d'un autre tenant
 * se lit « introuvable », jamais « interdit », car l'appelant n'a pas à
 * apprendre qu'il existe.
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
/** Le prompt de style est préfixé au prompt de chaque plan, donc il reste court. */
export const STYLE_PROMPT_MAX = 2_000;

/** Doit rester en phase avec `pipelineEnum` ; un test le vérifie. */
export const PIPELINES = ['image', 'video', 'mixed'] as const;

/** Trim, et lit un champ vide comme « effacé » plutôt que comme chaîne vide. */
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

/** Champ absent signifie « ne pas y toucher » ; champ vide signifie « effacer ». */
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

/** Supprimer un projet est la seule action projet réservée aux owners et admins. */
export function assertCanDeleteProject(user: { role: string }): void {
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw new ProjectError(
      'Only an owner or admin can delete a project.',
      403
    );
  }
}

/**
 * Projets du tenant, touchés le plus récemment d'abord, chacun avec le nombre
 * de vidéos qu'il contient.
 *
 * Les comptages sont un `COUNT` indexé par projet plutôt qu'une requête
 * groupée unique : `tenantDb()` n'a pas de `GROUP BY`, et en ajouter un au
 * wrapper d'isolation pour économiser quelques allers-retours sur une liste
 * de quelques lignes serait un mauvais marché. Charger chaque ligne vidéo
 * pour les compter en mémoire le serait davantage.
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
    // Même réponse que l'id soit inconnu ou détenu par quelqu'un d'autre.
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
 * Supprime un projet vide.
 *
 * Un projet contenant des vidéos est refusé plutôt que supprimé en cascade :
 * ces vidéos portent des crédits consommés, des assets rendus et des ids
 * YouTube publiés. Les détruire derrière un simple clic anéantirait du travail
 * payé et la trace de ce qu'il a coûté.
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
