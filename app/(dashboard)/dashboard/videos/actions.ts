'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { tenantDb } from '@/lib/db/tenant-db';
import { InsufficientCreditsError } from '@/lib/credits';
import { LlmError, LlmNotConfiguredError } from '@/lib/llm/deepseek';
import { StorageNotConfiguredError } from '@/lib/storage';
import { VoiceError, VoiceNotConfiguredError } from '@/lib/voice/elevenlabs';
import { ImageError, ImageNotConfiguredError } from '@/lib/images/flux';
import { AnimationError, AnimationNotConfiguredError } from '@/lib/video';
import {
  VideoError,
  createVideo,
  deleteVideo,
  videoInputSchema,
} from '@/lib/videos';
import {
  StoryboardError,
  addShot,
  deleteShot,
  generateImages,
  generateStoryboard,
  generateVoiceover,
  moveShot,
  submitClips,
  reorderShots,
  shotInputSchema,
  updateShot,
  validateStoryboard,
} from '@/lib/storyboard';

/**
 * Mutations des vidéos et des storyboards. Les règles vivent dans lib/videos
 * et lib/storyboard ; ces actions valident un formulaire, récupèrent le
 * tenant depuis la session, et transforment une erreur levée en phrase que la
 * page peut afficher.
 */

const videoIdentity = z.object({
  videoId: z.coerce.number().int().positive(),
});

const shotIdentity = videoIdentity.extend({
  shotId: z.coerce.number().int().positive(),
});

function formError(error: unknown): { error: string } {
  if (
    error instanceof VideoError ||
    error instanceof StoryboardError ||
    error instanceof LlmError ||
    error instanceof LlmNotConfiguredError ||
    error instanceof VoiceError ||
    error instanceof VoiceNotConfiguredError ||
    error instanceof ImageError ||
    error instanceof ImageNotConfiguredError ||
    error instanceof AnimationError ||
    error instanceof AnimationNotConfiguredError ||
    error instanceof StorageNotConfiguredError
  ) {
    return { error: error.message };
  }

  if (error instanceof InsufficientCreditsError) {
    return {
      error:
        `This storyboard needs ${error.required} credits and you have ` +
        `${error.available}. Top up from the billing page.`,
    };
  }

  console.error('Video action failed:', error);
  return { error: 'Something went wrong. Please try again.' };
}

export const createVideoAction = validatedActionWithUser(
  videoInputSchema,
  async (data, _formData, user) => {
    let videoId: number;
    try {
      const video = await createVideo(tenantDb(user.tenantId), data);
      videoId = video.id;
    } catch (error) {
      return formError(error);
    }

    revalidatePath(`/dashboard/projects/${data.projectId}`);
    redirect(`/dashboard/videos/${videoId}`);
  }
);

export const generateStoryboardAction = validatedActionWithUser(
  videoIdentity,
  async (data, _formData, user) => {
    try {
      await generateStoryboard(tenantDb(user.tenantId), data.videoId);
    } catch (error) {
      return formError(error);
    }

    revalidatePath(`/dashboard/videos/${data.videoId}`);
    return { success: 'Storyboard generated.' };
  }
);

export const addShotAction = validatedActionWithUser(
  shotInputSchema.merge(videoIdentity),
  async (data, _formData, user) => {
    const { videoId, ...shot } = data;
    try {
      await addShot(tenantDb(user.tenantId), videoId, shot);
    } catch (error) {
      return formError(error);
    }

    revalidatePath(`/dashboard/videos/${videoId}`);
    return { success: 'Shot added.' };
  }
);

/**
 * Chaque bouton d'une carte de plan poste le même formulaire, distingué par
 * `intent`.
 *
 * Un formulaire par plan au lieu de quatre signifie un chemin de soumission,
 * un emplacement d'erreur, et pas de formulaires imbriqués — ce que HTML
 * n'autorise de toute façon pas. Les champs du plan ne sont validés que pour
 * `save` : un utilisateur qui a effacé le prompt doit toujours pouvoir
 * supprimer le plan.
 */
const shotFormSchema = shotIdentity.extend({
  intent: z.enum(['save', 'delete', 'up', 'down']),
  type: z.string().optional(),
  prompt: z.string().optional(),
  narration: z.string().optional(),
});

export const shotFormAction = validatedActionWithUser(
  shotFormSchema,
  async (data, _formData, user) => {
    const tdb = tenantDb(user.tenantId);

    try {
      if (data.intent === 'delete') {
        await deleteShot(tdb, data.videoId, data.shotId);
      } else if (data.intent === 'save') {
        const shot = shotInputSchema.parse({
          type: data.type,
          prompt: data.prompt,
          narration: data.narration,
        });
        await updateShot(tdb, data.videoId, data.shotId, shot);
      } else {
        await moveShot(tdb, data.videoId, data.shotId, data.intent);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { error: error.errors[0]?.message ?? 'This shot is not valid.' };
      }
      return formError(error);
    }

    revalidatePath(`/dashboard/videos/${data.videoId}`);
    return data.intent === 'save' ? { success: 'Shot saved.' } : {};
  }
);

/**
 * Nouvel ordre des scènes, tel que le glisser-déposer le produit. Toutes les
 * règles restent dans lib/storyboard : liste exacte des id de la vidéo,
 * brouillon uniquement, renumérotation en transaction.
 */
const reorderSchema = videoIdentity.extend({
  /** Les id, sérialisés : un champ répété serait écrasé par Object.fromEntries. */
  orderedIds: z.string().transform((raw, ctx) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(
          (id): id is number =>
            typeof id === 'number' && Number.isInteger(id) && id > 0
        )
      ) {
        return parsed;
      }
    } catch {
      // tombé dans le retour d'erreur ci-dessous
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ordre invalide.' });
    return z.NEVER;
  }),
});

export const reorderShotsAction = validatedActionWithUser(
  reorderSchema,
  async (data, _formData, user) => {
    try {
      await reorderShots(tenantDb(user.tenantId), data.videoId, data.orderedIds);
    } catch (error) {
      return formError(error);
    }

    revalidatePath(`/dashboard/videos/${data.videoId}`);
    return { success: 'Ordre enregistré.' };
  }
);

/**
 * Enregistre la voix off. C'est ce qui transforme un prix estimé en prix
 * exact : la durée de chaque scène devient la longueur réelle de son audio.
 */
export const generateVoiceoverAction = validatedActionWithUser(
  videoIdentity,
  async (data, _formData, user) => {
    try {
      const { voiced, skipped } = await generateVoiceover(
        tenantDb(user.tenantId),
        data.videoId
      );
      revalidatePath(`/dashboard/videos/${data.videoId}`);
      return {
        success:
          `Voice-over recorded for ${voiced} scene${voiced === 1 ? '' : 's'}` +
          (skipped > 0 ? ` (${skipped} already done).` : '.'),
      };
    } catch (error) {
      return formError(error);
    }
  }
);

/**
 * La validation est la seule étape qui dépense de l'argent. Elle refuse tant
 * qu'une scène est encore facturée sur une estimation, pour que le montant
 * sur le bouton soit le montant débité — voir lib/storyboard/service.ts.
 */
export const validateVideoAction = validatedActionWithUser(
  videoIdentity,
  async (data, _formData, user) => {
    try {
      const { charged } = await validateStoryboard(
        tenantDb(user.tenantId),
        data.videoId
      );
      revalidatePath(`/dashboard/videos/${data.videoId}`);
      return { success: `Validated — ${charged} credits charged.` };
    } catch (error) {
      return formError(error);
    }
  }
);

/**
 * Les visuels : les fixes d'abord, les clips ensuite.
 *
 * L'ordre n'est pas une commodité. Tous les modèles retenus font de
 * l'image-to-video : sans sa fixe, un plan animé n'a rien à animer.
 *
 * L'action rend la main dès que les clips sont **soumis**, pas rendus. Un clip
 * met une minute et une vidéo en compte une quinzaine ; c'est le webhook de
 * Replicate qui les posera sur R2 au fur et à mesure.
 */
export const generateVisualsAction = validatedActionWithUser(
  videoIdentity,
  async (data, _formData, user) => {
    const tdb = tenantDb(user.tenantId);

    try {
      const stills = await generateImages(tdb, data.videoId);
      const clips = await submitClips(tdb, data.videoId);

      revalidatePath(`/dashboard/videos/${data.videoId}`);

      const drawn = `${stills.generated} still${stills.generated === 1 ? '' : 's'} drawn`;
      return {
        success: clips.submitted
          ? `${drawn}, ${clips.submitted} clip${clips.submitted === 1 ? '' : 's'} ` +
            'under way — they will appear as the provider returns them.'
          : `${drawn}.`,
      };
    } catch (error) {
      return formError(error);
    }
  }
);

export const deleteVideoAction = validatedActionWithUser(
  videoIdentity.extend({ projectId: z.coerce.number().int().positive() }),
  async (data, _formData, user) => {
    try {
      await deleteVideo(tenantDb(user.tenantId), data.videoId);
    } catch (error) {
      return formError(error);
    }

    revalidatePath(`/dashboard/projects/${data.projectId}`);
    redirect(`/dashboard/projects/${data.projectId}`);
  }
);
