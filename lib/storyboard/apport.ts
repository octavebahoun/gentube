import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { shots, videos } from '@/lib/db/schema';
import type { TenantDb } from '@/lib/db/tenant-db';
import { AssetError, getClientAsset } from '@/lib/assets';
import { getVideo } from '@/lib/videos';
import { decouperLimport } from './decoupage';
import { habille } from './registres';
import { wordTimingSchema } from './render';
import { StoryboardError, editStoryboard, type StoryboardView } from './service';

/**
 * Monte une vidéo apportée par le client, en plans.
 *
 * **Ce qui manquait.** `bindAssetToShot` lie un fichier à **un** plan : c'est
 * juste pour une capture d'écran ou une photo de produit, qui sont chacune une
 * scène. Une vidéo de trente secondes n'est pas une scène — la lier telle
 * quelle donnait un plan unique de trente secondes qu'on habillait de
 * sous-titres, et le montage n'avait rien à monter. Le découpage existait,
 * mais seulement dans une démonstration.
 *
 * **Ce que cette fonction remplace.** Tous les plans de la vidéo, en bloc.
 * C'est le même contrat que la réécriture du storyboard : des plans à moitié
 * remplacés seraient pire que l'un ou l'autre état. Et comme toute édition de
 * storyboard, c'est refusé hors brouillon — après validation les crédits sont
 * débités, et retailler les plans changerait ce qui a été payé.
 *
 * **Rien n'est facturé ici, et rien ne le sera après.** Aucune étape payante
 * ne touche un plan servi par un fichier client : `generateImages` saute ce
 * qui a un `sourceImageUrl`, `submitClips` ce qui a un `assetUrl`. Le seul
 * coût de ce cas d'usage est la transcription, déjà payée au dépôt.
 */
export async function monterLapport(
  tdb: TenantDb,
  videoId: number,
  assetId: number
): Promise<StoryboardView> {
  const video = await getVideo(tdb, videoId);
  const asset = await getClientAsset(tdb, assetId);

  if (asset.kind !== 'video') {
    throw new AssetError(
      'Only a video can be cut into shots. An image is one scene: attach it ' +
        'to a scene instead.'
    );
  }

  /*
   * La durée du fichier, mesurée par le navigateur au dépôt.
   *
   * Sans elle on ne sait pas où s'arrête le dernier plan, et le déduire du
   * dernier mot du transcript couperait la fin — un plan se termine souvent
   * après la dernière syllabe. Le serveur ne peut pas la lire : il n'y a pas
   * de ffprobe en serverless.
   */
  if (!asset.durationS || asset.durationS <= 0) {
    throw new AssetError(
      'That video has no measured duration, so we cannot tell where the last ' +
        'shot ends. Upload it again from a browser that can read it.'
    );
  }

  /*
   * Les mots, s'il y en a. Sans transcript, `decouperLimport` rend un plan
   * unique : il n'y a aucun silence où couper, et découper à l'aveugle
   * vaudrait moins qu'un plan franc.
   */
  const mots = z.array(wordTimingSchema).safeParse(asset.words ?? []);
  const plans = decouperLimport(
    mots.success ? mots.data : [],
    asset.durationS,
    video.registre
  );

  if (plans.length === 0) {
    throw new StoryboardError('That video produced no shot to montage.', 409);
  }

  return await editStoryboard(tdb, videoId, async (tx) => {
    await tx.delete(shots, eq(shots.videoId, videoId));
    await tx.insert(
      shots,
      plans.map((plan, index) => ({
        videoId,
        order: index + 1,
        // Une vidéo déposée est le plan entier : le type suit le fichier,
        // sinon le rendu chercherait une image là où il y a un clip.
        type: 'video' as const,
        // Rien à générer, donc rien à décrire. Le prompt visuel d'un plan
        // servi par un fichier ne partirait chez personne.
        prompt: '',
        narration: plan.words.map((mot) => mot.text).join(' '),
        sourceAssetId: asset.id,
        assetUrl: asset.key,
        sourceImageUrl: null,
        durationS: plan.durationS,
        // Mesurée sur le fichier, pas estimée depuis un texte : c'est la
        // condition pour que la vidéo puisse être validée.
        durationSource: 'measured' as const,
        status: 'ready' as const,
        words: plan.words,
        render: {
          /*
           * `mediaVolume: 1` distingue ce cas de tous les autres : un clip
           * généré arrive muet et la voix off passe par-dessus, alors qu'ici
           * la bande son **est** celle du client.
           *
           * Ce champ décide aussi de la durée à l'écran : une scène dont le
           * média porte son son ne tient aucune pause après sa fin, sinon
           * elle rejoue une seconde déjà vue à la coupe suivante.
           */
          mediaVolume: 1,
          mediaStart: plan.mediaStart,
          // Le recadrage alterne d'un plan à l'autre : c'est lui qui rend la
          // coupe visible sur une source continue.
          ...(plan.reframe ? { reframe: plan.reframe } : {}),
          effects: {
            ...habille(video.registre, 'pose', index, plans.length),
            /*
             * Ni zoom ni transition, et ce ne sont pas des oublis.
             *
             * Un zoom se battrait avec le mouvement propre de l'image. Une
             * transition fait reculer la scène suivante pour que le
             * chevauchement tombe dans le fondu : juste quand chaque plan est
             * muet, mais ici deux plans qui se chevauchent font jouer deux
             * fois la même bande son décalée d'une demi-seconde. Un écho.
             *
             * Sur une source continue, le rythme du montage vient de l'endroit
             * où tombent les coupes, pas de l'effet posé entre elles.
             */
            zoom: 'none' as const,
            transition: 'none' as const,
          },
        },
      }))
    );

    // La provenance de la vidéo, pour que l'interface sache de quel cas
    // d'usage elle parle sans le déduire des plans.
    await tx.update(
      videos,
      { source: 'footage' as const, updatedAt: new Date() },
      eq(videos.id, videoId)
    );
  });
}
