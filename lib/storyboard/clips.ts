import { and, eq, inArray } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { jobs, shots, type Shot, type Video } from '@/lib/db/schema';
import { getVideo } from '@/lib/videos';
import { createAssetStore, type AssetStore } from '@/lib/storage';
import {
  ANIMATE_STEP,
  AnimationNotConfiguredError,
  createAnimator,
  maxClipSeconds,
  type AnimationJobPayload,
  type VideoAnimator,
} from '@/lib/video';
import { rendersOwnContent, sceneRenderSchema } from './render';
import { StoryboardError, listShots } from './service';
import { assertGeneratable } from './images';

/**
 * L'étape clip — la plus chère du pipeline, et la seule qui n'attend pas.
 *
 * Une seconde de clip coûte plus de cent fois une seconde d'image fixe
 * (`lib/credits/pricing.ts`). Ce qui se passe ici se compte donc à la scène,
 * pas au lot.
 *
 * Rien n'est attendu : chaque plan part chez Replicate, son identifiant de
 * prédiction est rangé dans `jobs.external_id`, et c'est le webhook qui pose
 * le clip sur R2. Une requête Vercel ne reste jamais ouverte pendant qu'un GPU
 * travaille — quinze plans, c'est un quart d'heure de GPU.
 *
 * Deux propriétés, les mêmes que pour les images et pour les mêmes raisons :
 *
 *  - **Reprise possible.** Un plan qui porte déjà un job vivant est sauté. Un
 *    second passage après un échec partiel ne repaie pas les clips obtenus.
 *  - **Séquentiel.** Les soumissions sont brèves, mais les enchaîner en
 *    parallèle serait le moyen le plus court de prendre un 429 — et Replicate
 *    ralentit déjà de lui-même quand le solde baisse (`docs/providers.md`).
 */

export type ClipsResult = {
  video: Video;
  shots: Shot[];
  /** Plans soumis par ce passage. Ceux déjà en cours ne comptent pas. */
  submitted: number;
  skipped: number;
  /** Ce que ces soumissions nous coûteront chez le fournisseur, en USD. */
  costUsd: number;
};

/**
 * Combien de temps l'image fixe doit rester lisible par le fournisseur.
 *
 * Une prédiction peut attendre en file avant de démarrer ; une URL signée
 * trop courte se périmerait entre la soumission et le téléchargement, et
 * l'échec serait mis sur le compte du modèle.
 */
const SOURCE_URL_TTL_S = 3_600;

/** Un plan porte déjà un job vivant : le resoumettre paierait deux fois. */
const LIVE = ['queued', 'running', 'succeeded'] as const;

/**
 * Ce qu'on demande au modèle d'animation.
 *
 * Le prompt visuel décrit la scène ; il a déjà servi à fabriquer l'image fixe.
 * Ce qui manque au clip, c'est le **mouvement** — et le storyboard le dit dans
 * `cameraMotion`, que le prompt système propose au modèle depuis le début et
 * que personne ne lisait. La valeur était écrite en base et perdue là.
 *
 * Sans directive, on garde un mouvement neutre : un plan animé sans intention
 * de caméra vaut mieux qu'un plan qui part dans une direction inventée.
 */
const CAMERA: Record<string, string> = {
  orbit: 'slow orbital camera move around the subject',
  dolly: 'steady dolly push toward the subject',
  pan: 'smooth horizontal camera pan',
  static: 'locked-off camera, only the subject moves',
};

export function animationPrompt(shot: Shot): string {
  const parsed = sceneRenderSchema.safeParse(shot.render ?? {});
  const motion = parsed.success ? parsed.data.effects?.cameraMotion : undefined;

  return [shot.prompt.trim(), motion ? CAMERA[motion] : 'subtle natural motion']
    .filter(Boolean)
    .join(', ');
}

function callbackBaseUrl(): string {
  const base = process.env.BASE_URL?.trim();
  if (!base) throw new AnimationNotConfiguredError('BASE_URL');
  return base.replace(/\/+$/, '');
}

export async function submitClips(
  tdb: TenantDb,
  videoId: number,
  {
    animator,
    store,
  }: { animator?: VideoAnimator; store?: AssetStore } = {}
): Promise<ClipsResult> {
  const video = await getVideo(tdb, videoId);
  assertGeneratable(video);

  const storyboard = await listShots(tdb, videoId);
  // Un plan qui dessine son propre écran n'est pas à animer, même si le
  // pipeline force `video` sur toutes les scènes : il n'a pas d'image fixe à
  // donner au modèle, et lui en demander une bloquait l'étape entière.
  const animated = storyboard.filter(
    (shot) => shot.type === 'video' && !rendersOwnContent(shot.render)
  );

  if (animated.length === 0) {
    return { video, shots: storyboard, submitted: 0, skipped: 0, costUsd: 0 };
  }

  // Les jobs vivants sont lus en une fois : quinze plans ne valent pas quinze
  // allers-retours pour savoir lesquels sont déjà partis.
  const live = await tdb.findMany(
    jobs,
    and(
      eq(jobs.videoId, videoId),
      eq(jobs.step, ANIMATE_STEP),
      inArray(jobs.status, [...LIVE])
    )
  );
  const claimed = new Set(
    live.map((job) => (job.payload as Partial<AnimationJobPayload>)?.shotId)
  );

  // Résolus paresseusement : une vidéo dont tous les clips sont partis ne doit
  // pas échouer parce que les clés fournisseur manquent.
  let client = animator;
  let assets = store;
  let base: string | null = null;

  let submitted = 0;
  let skipped = 0;
  let costUsd = 0;

  for (const shot of animated) {
    if (shot.assetUrl || claimed.has(shot.id)) {
      skipped += 1;
      continue;
    }

    if (!shot.sourceImageUrl) {
      throw new StoryboardError(
        `Scene ${shot.order} has no still to animate: generate the images first.`,
        409
      );
    }

    const ceiling = maxClipSeconds(video.resolution);
    if (shot.durationS > ceiling) {
      // Le modèle ne sait pas rendre plus long d'un trait, et ralentir le clip
      // pour couvrir la voix off se verrait. La scène doit être coupée en deux.
      throw new StoryboardError(
        `Scene ${shot.order} lasts ${shot.durationS}s; a ${video.resolution} ` +
          `clip cannot exceed ${ceiling}s. Split the scene in two.`,
        409
      );
    }

    client ??= createAnimator();
    assets ??= createAssetStore();
    base ??= callbackBaseUrl();

    // Le job est écrit AVANT la soumission : c'est lui que l'URL de rappel
    // nomme, et c'est ce qui permet au webhook de trouver la ligne même s'il
    // double l'écriture de l'identifiant de prédiction.
    const [job] = await tdb.insert(jobs, {
      videoId,
      step: ANIMATE_STEP,
      status: 'queued',
      payload: { shotId: shot.id, order: shot.order },
      attempts: 1,
    });

    try {
      const started = await client.submit({
        imageUrl: await assets.signedUrl(shot.sourceImageUrl, SOURCE_URL_TTL_S),
        prompt: animationPrompt(shot),
        durationS: shot.durationS,
        resolution: video.resolution,
        ratio: video.ratio,
        webhookUrl: `${base}/api/webhooks/replicate?job=${job.id}`,
      });

      // `eq(status, 'queued')` ferme l'autre moitié de la course. Écrire le
      // job avant de soumettre garantit qu'un rappel le trouve ; ça n'empêche
      // pas ce retour d'écraser un `succeeded` déjà posé par le webhook, ce
      // qui remettait le plan en `generating` et le job en `running` — donc
      // sauté à jamais, puisque `LIVE` contient `running`.
      await tdb.update(
        jobs,
        {
          externalId: started.externalId,
          status: 'running',
          payload: {
            shotId: shot.id,
            order: shot.order,
            model: started.model,
            costUsd: started.costUsd,
          } satisfies AnimationJobPayload,
          updatedAt: new Date(),
        },
        and(eq(jobs.id, job.id), eq(jobs.status, 'queued'))
      );

      await tdb.update(
        shots,
        { status: 'generating', updatedAt: new Date() },
        and(eq(shots.id, shot.id), eq(shots.status, 'pending'))
      );

      submitted += 1;
      costUsd += started.costUsd;
    } catch (error) {
      // Le job reste, marqué échoué : une ligne `queued` sans identifiant de
      // prédiction serait un plan qu'on croit parti et que personne n'attend.
      await tdb.update(
        jobs,
        {
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 2_000) : String(error),
          updatedAt: new Date(),
        },
        eq(jobs.id, job.id)
      );
      throw error;
    }
  }

  return {
    video: await getVideo(tdb, videoId),
    shots: await listShots(tdb, videoId),
    submitted,
    skipped,
    costUsd,
  };
}
