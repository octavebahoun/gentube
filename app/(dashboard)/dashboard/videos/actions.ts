'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { tenantDb } from '@/lib/db/tenant-db';
import { InsufficientCreditsError } from '@/lib/credits';
import { LlmError, LlmNotConfiguredError } from '@/lib/llm/deepseek';
import { StorageNotConfiguredError } from '@/lib/storage';
import { AssetError, bindAssetToShot } from '@/lib/assets';
import { monterLapport } from '@/lib/storyboard/apport';
import { VoiceError, VoiceNotConfiguredError } from '@/lib/voice/elevenlabs';
import { ImageError, ImageNotConfiguredError } from '@/lib/images/flux';
import { AnimationError, AnimationNotConfiguredError } from '@/lib/video';
import {
  RATIOS,
  RESOLUTIONS,
  SUBTITLE_STYLES,
  VideoError,
  createVideo,
  deleteVideo,
  updateVideo,
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
import { renderVideo } from '@/lib/render/sortie';
import { animateWithNovita } from '@/lib/video/novita';

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
    error instanceof StorageNotConfiguredError ||
    error instanceof AssetError
  ) {
    // Dit aussi côté serveur. Une erreur métier ne partait que dans la page,
    // et un écran qui ne bouge pas ne laissait aucune trace à lire.
    console.warn(`[action] ${error.name}: ${error.message}`);
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
  intent: z.enum(['save', 'delete', 'up', 'down', 'bind']),
  type: z.string().optional(),
  prompt: z.string().optional(),
  narration: z.string().optional(),
  /**
   * Le fichier du client à servir sur ce plan.
   *
   * Seul `bind` le lit, et il ne lit rien d'autre : lier ne doit pas
   * enregistrer au passage un prompt que l'utilisateur n'a pas fini d'écrire.
   * Une chaîne vide arrive quand le sélecteur est sur « aucun » — c'est un
   * geste sans effet, pas une erreur.
   */
  assetId: z.coerce.number().int().positive().optional(),
});

export const shotFormAction = validatedActionWithUser(
  shotFormSchema,
  async (data, _formData, user) => {
    const tdb = tenantDb(user.tenantId);

    try {
      if (data.intent === 'delete') {
        await deleteShot(tdb, data.videoId, data.shotId);
      } else if (data.intent === 'bind') {
        /*
         * Lier un fichier déposé, et c'est le geste qui définit trois des
         * quatre cas d'usage.
         *
         * Après ça, aucune étape payante ne touche ce plan : `generateImages`
         * saute ce qui a un `sourceImageUrl`, `submitClips` ce qui a un
         * `assetUrl`. Une capture d'écran, une photo de produit ou une vidéo
         * tournée deviennent la scène sans passer par un fournisseur.
         *
         * Rien à faire quand le sélecteur est resté sur « aucun » : un
         * formulaire posté sans choix ne doit pas être une erreur.
         */
        if (!data.assetId) return {};
        await bindAssetToShot(tdb, data.shotId, data.assetId);
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
    if (data.intent === 'save') return { success: 'Shot saved.' };
    if (data.intent === 'bind') return { success: 'File attached to this scene.' };
    return {};
  }
);

/**
 * Le montage d'une vidéo apportée par le client.
 *
 * **Pourquoi une action à part de `bind`.** Lier attache un fichier à **un**
 * plan, ce qui est juste pour une capture ou une photo. Une vidéo de trente
 * secondes n'est pas un plan : elle se découpe, et le découpage remplace tous
 * les plans de la vidéo. Deux gestes trop différents pour un même bouton — et
 * l'un est destructeur, l'autre pas.
 */
const monterApportSchema = videoIdentity.extend({
  assetId: z.coerce.number().int().positive(),
});

export const monterApportAction = validatedActionWithUser(
  monterApportSchema,
  async (data, _formData, user) => {
    try {
      await monterLapport(tenantDb(user.tenantId), data.videoId, data.assetId);
    } catch (error) {
      return formError(error);
    }

    revalidatePath(`/dashboard/videos/${data.videoId}`);
    return { success: 'Video cut into shots.' };
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

/**
 * Les clips par Novita — un chemin d'essai, à côté de Replicate.
 *
 * Il ne remplace rien : `generateVisualsAction` reste le chemin du produit.
 * Celui-ci sert à obtenir une génération vidéo tout de suite, depuis l'écran,
 * pour éprouver la cohérence de la chaîne. Novita n'a pas de webhook, donc
 * l'action attend chaque clip — comptez une à deux minutes par plan animé.
 *
 * Rien n'est débité : la table des prix est celle de Wan chez Replicate, et
 * brancher un autre modèle dessus ferait mentir la facture.
 */
export const animateNovitaAction = validatedActionWithUser(
  videoIdentity,
  async (data, _formData, user) => {
    try {
      const { animated, skipped } = await animateWithNovita(
        tenantDb(user.tenantId),
        data.videoId
      );
      revalidatePath(`/dashboard/videos/${data.videoId}`);
      return {
        success:
          `${animated} clip${animated === 1 ? '' : 's'} generated by Novita` +
          (skipped ? `, ${skipped} already there.` : '.'),
      };
    } catch (error) {
      return formError(error);
    }
  }
);

/**
 * Le montage : la vidéo devient un fichier.
 *
 * L'action **attend** la fin du rendu, une minute environ pour une vidéo d'une
 * minute. C'est tenable pour un essai depuis l'écran, pas pour des clients en
 * parallèle : une action serveur qui bloque tient une connexion ouverte, et le
 * jour où deux rendus se lancent ensemble la machine fait les deux à la fois.
 * Le passage par une file est la suite, pas une option.
 */
export const renderVideoAction = validatedActionWithUser(
  videoIdentity,
  async (data, _formData, user) => {
    try {
      const { durationInSeconds, tookSeconds } = await renderVideo(
        tenantDb(user.tenantId),
        data.videoId
      );
      revalidatePath(`/dashboard/videos/${data.videoId}`);
      return {
        success:
          `Rendered — ${durationInSeconds.toFixed(1)}s of video ` +
          `in ${tookSeconds.toFixed(1)}s of machine.`,
      };
    } catch (error) {
      return formError(error);
    }
  }
);

/**
 * Les réglages de rendu d'une vidéo : résolution, sous-titres, musique.
 *
 * Trois colonnes qui existaient depuis l'origine sans qu'aucun écran ne les
 * touche. `updateVideo` refuse tout ce qui n'est plus un brouillon : passé la
 * validation, les crédits sont débités sur une définition, et la changer
 * ferait payer une vidéo pour en produire une autre.
 */
export const videoSettingsAction = validatedActionWithUser(
  videoIdentity.extend({
    resolution: z.enum(RESOLUTIONS).optional(),
    ratio: z.enum(RATIOS).optional(),
    subtitleStyle: z.enum(SUBTITLE_STYLES).optional(),
    musicUrl: z.string().optional(),
  }),
  async (data, _formData, user) => {
    try {
      await updateVideo(tenantDb(user.tenantId), data.videoId, {
        resolution: data.resolution,
        ratio: data.ratio,
        subtitleStyle: data.subtitleStyle,
        musicUrl: data.musicUrl,
      });
      revalidatePath(`/dashboard/videos/${data.videoId}`);
      return { success: 'Réglages enregistrés.' };
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
