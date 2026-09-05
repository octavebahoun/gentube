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
import { AssetError, transcribeClientAsset, uploadClientAsset } from '@/lib/assets';
import { StorageNotConfiguredError } from '@/lib/storage';
import {
  TranscriptionError,
  TranscriptionNotConfiguredError,
} from '@/lib/transcribe/whisper';

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
  if (error instanceof ProjectError || error instanceof AssetError) {
    return { error: error.message };
  }
  if (error instanceof StorageNotConfiguredError) return { error: error.message };
  // La transcription dit pourquoi elle a refusé — piste muette, format,
  // fournisseur pas configuré. Sans ça, le client lisait « quelque chose s'est
  // mal passé » et n'avait rien à corriger.
  if (
    error instanceof TranscriptionError ||
    error instanceof TranscriptionNotConfiguredError
  ) {
    return { error: error.message };
  }
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

/**
 * Le dépôt d'un fichier client.
 *
 * **Les mesures viennent du navigateur.** `width`, `height` et `durationS` sont
 * postés par le formulaire parce que les lire ici demanderait un décodeur natif
 * — `sharp` pour une image, ffprobe pour une vidéo — qui ne tient pas dans une
 * fonction serverless. Le navigateur les connaît déjà.
 *
 * Elles ne servent qu'à l'affichage et au cadrage, jamais à la facturation :
 * un client qui les fausserait ne gagnerait rien. Le poids réel, lui, est
 * mesuré ici sur les octets reçus, et c'est celui qui borne.
 */
const uploadAssetSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  durationS: z.coerce.number().positive().optional(),
});

export const uploadAssetAction = validatedActionWithUser(
  uploadAssetSchema,
  async (data, formData, user) => {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { error: 'Choose a file first.' };
    }

    let asset;
    try {
      asset = await uploadClientAsset(tenantDb(user.tenantId), data.projectId, {
        bytes: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
        originalName: file.name,
        width: data.width,
        height: data.height,
        durationS: data.durationS,
      });
    } catch (error) {
      return formError(error);
    }

    revalidatePath(`/dashboard/projects/${data.projectId}`);
    // L'identifiant remonte pour que le navigateur enchaîne la transcription
    // de la bande son, qu'il est seul à savoir extraire.
    return { success: `${file.name} added.`, assetId: asset.id };
  }
);

/**
 * La transcription de la bande son d'une vidéo déposée.
 *
 * **Deux requêtes et pas une.** L'audio pourrait accompagner la vidéo dans le
 * même envoi, mais ce serait cent mégaoctets plus la piste dans un seul corps,
 * et un refus de Workers AI ferait alors perdre le dépôt entier. Séparées, ce
 * qui est déposé reste déposé : la transcription est un bonus qui peut
 * manquer, pas une condition.
 *
 * **Le navigateur envoie du WAV mono 16 kHz**, produit par
 * `extraireLaBandeSon`. Le serveur ne sait pas extraire une piste d'un MP4 —
 * il n'y a pas de ffmpeg en serverless — et ne prétend pas le faire.
 */
const transcribeAssetSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  assetId: z.coerce.number().int().positive(),
});

export const transcribeAssetAction = validatedActionWithUser(
  transcribeAssetSchema,
  async (data, formData, user) => {
    const audio = formData.get('audio');
    if (!(audio instanceof File) || audio.size === 0) {
      return { error: 'There is no soundtrack to transcribe.' };
    }

    try {
      await transcribeClientAsset(
        tenantDb(user.tenantId),
        data.assetId,
        Buffer.from(await audio.arrayBuffer())
      );
    } catch (error) {
      return formError(error);
    }

    revalidatePath(`/dashboard/projects/${data.projectId}`);
    return { success: 'Soundtrack transcribed.' };
  }
);
