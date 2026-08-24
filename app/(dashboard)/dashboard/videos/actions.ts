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
  generateStoryboard,
  generateVoiceover,
  moveShot,
  shotInputSchema,
  updateShot,
  validateStoryboard,
} from '@/lib/storyboard';

/**
 * Video and storyboard mutations. The rules live in lib/videos and
 * lib/storyboard; these actions validate a form, pick the tenant from the
 * session, and turn a thrown error into a sentence the page can show.
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
 * Every button on a shot card posts the same form, distinguished by `intent`.
 *
 * One form per shot instead of four means one submit path, one error slot, and
 * no nested forms — which HTML does not allow anyway. The shot fields are
 * validated only for `save`: a user who cleared the prompt must still be able
 * to delete the shot.
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
 * Records the voice-over. This is what turns an estimated price into an exact
 * one: the duration of every scene becomes the real length of its audio.
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
 * Validation is the only step that spends money. It refuses while any scene is
 * still priced on an estimate, so the amount on the button is the amount
 * debited — see lib/storyboard/service.ts.
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
