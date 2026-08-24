'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { tenantDb } from '@/lib/db/tenant-db';
import {
  ProjectError,
  assertCanDeleteProject,
  createProject,
  deleteProject,
  projectInputSchema,
  updateProject,
} from '@/lib/projects';

/**
 * Mutations des projets. Les règles métier vivent dans lib/projects — ces
 * actions ne font que valider un formulaire, récupérer le tenant depuis la
 * session et transformer une `ProjectError` levée en quelque chose que le
 * formulaire peut afficher.
 */

const identified = z.object({
  id: z.coerce.number().int().positive(),
});

const updateProjectSchema = projectInputSchema.merge(identified);

/** Les erreurs Zod sont déjà signalées par `validatedActionWithUser`. */
function formError(error: unknown): { error: string } {
  if (error instanceof ProjectError) return { error: error.message };
  console.error('Project action failed:', error);
  return { error: 'Something went wrong. Please try again.' };
}

export const createProjectAction = validatedActionWithUser(
  projectInputSchema,
  async (data, _formData, user) => {
    let projectId: number;
    try {
      const project = await createProject(tenantDb(user.tenantId), data);
      projectId = project.id;
    } catch (error) {
      return formError(error);
    }

    // En dehors du try : redirect() signale en levant, et l'attraper ici
    // transformerait une création réussie en « une erreur est survenue ».
    revalidatePath('/dashboard/projects');
    redirect(`/dashboard/projects/${projectId}`);
  }
);

export const updateProjectAction = validatedActionWithUser(
  updateProjectSchema,
  async (data, _formData, user) => {
    const { id, ...fields } = data;

    try {
      await updateProject(tenantDb(user.tenantId), id, fields);
    } catch (error) {
      return formError(error);
    }

    revalidatePath('/dashboard/projects');
    revalidatePath(`/dashboard/projects/${id}`);
    return { success: 'Project saved.' };
  }
);

export const deleteProjectAction = validatedActionWithUser(
  identified,
  async (data, _formData, user) => {
    try {
      assertCanDeleteProject(user);
      await deleteProject(tenantDb(user.tenantId), data.id);
    } catch (error) {
      // Un projet contenant des vidéos est refusé ici, avec le nombre dans le
      // message.
      return formError(error);
    }

    revalidatePath('/dashboard/projects');
    redirect('/dashboard/projects');
  }
);
