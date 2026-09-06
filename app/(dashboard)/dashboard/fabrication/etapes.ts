import type { shots, videos } from '@/lib/db/schema';
import { QUALITY_LABEL } from '@/lib/credits/pricing';

/*
 * L'état réel de la fabrication, étape par étape.
 * Ce module ne dessine rien : il lit la vidéo et ses scènes, et dit où en est
 * chaque poste. La page se contente de l'afficher.
 */

export type EtapeEtat = 'faite' | 'encours' | 'attente' | 'echec' | 'indispo';
export type Etape = {
  cle: string;
  titre: string;
  detail: string;
  etat: EtapeEtat;
};

export function buildEtapes(
  video: (typeof videos)['$inferSelect'],
  shotList: (typeof shots)['$inferSelect'][]
): Etape[] {
  const total = shotList.length;
  const avecAudio = shotList.filter((s) => s.audioUrl).length;
  const avecImage = shotList.filter((s) => s.sourceImageUrl).length;
  const videoShots = shotList.filter((s) => s.type === 'video');
  const avecClip = videoShots.filter((s) => s.assetUrl).length;
  const echecShot = shotList.some((s) => s.status === 'failed');

  // 1 — Storyboard
  const storyboard: Etape = {
    cle: 'storyboard',
    titre: 'Storyboard',
    detail:
      total === 0
        ? 'Aucune scène — générez le storyboard depuis la vidéo'
        : `${total} scène${total > 1 ? 's' : ''} · ${QUALITY_LABEL[video.quality]}`,
    etat: total > 0 ? 'faite' : video.status === 'failed' ? 'echec' : 'attente',
  };

  // 2 — Voix off
  let voixEtat: EtapeEtat = 'attente';
  let voixDetail = 'En attente du storyboard';
  if (total > 0) {
    if (avecAudio === total && avecAudio > 0) {
      voixEtat = 'faite';
      voixDetail = 'Voix enregistrée — durée mesurée';
    } else if (avecAudio > 0) {
      voixEtat = 'encours';
      voixDetail = `${avecAudio}/${total} scènes enregistrées`;
    } else if (video.status === 'failed') {
      voixEtat = 'echec';
      voixDetail = 'Échec de la voix off — relance possible';
    } else {
      voixDetail = 'Prêt à enregistrer';
    }
  }
  const voix: Etape = { cle: 'voix', titre: 'Voix off', detail: voixDetail, etat: voixEtat };

  // 3 — Images (Flux)
  let imagesEtat: EtapeEtat = 'attente';
  let imagesDetail = 'En attente de la voix off';
  if (total > 0 && avecAudio === total) {
    if (avecImage === total) {
      imagesEtat = 'faite';
      imagesDetail = `${avecImage}/${total} images générées`;
    } else if (avecImage > 0) {
      imagesEtat = echecShot ? 'echec' : 'encours';
      imagesDetail = `${avecImage}/${total} images — ${echecShot ? 'certaines ont échoué' : 'en cours'}`;
    } else if (video.status === 'failed') {
      imagesEtat = 'echec';
      imagesDetail = 'Échec des images';
    } else {
      imagesDetail = 'Prêtes à générer après la voix';
    }
  } else if (total > 0) {
    imagesDetail = 'La voix off doit être enregistrée d’abord';
  }
  const images: Etape = { cle: 'images', titre: 'Images', detail: imagesDetail, etat: imagesEtat };

  // 4 — Plans animés (Wan) — pas encore branché
  const clips: Etape = {
    cle: 'clips',
    titre: 'Plans animés',
    detail:
      videoShots.length === 0
        ? 'Aucun plan animé dans ce storyboard'
        : `${avecClip}/${videoShots.length} clips — bientôt disponible (Wan)`,
    etat: videoShots.length === 0 ? 'indispo' : 'indispo',
  };

  // 5 — Montage (HyperFrames) — local OK, Lambda en prod à venir
  let montageEtat: EtapeEtat = 'indispo';
  let montageDetail = 'Bientôt : montage HyperFrames';
  if (video.outputUrl) {
    montageEtat = 'faite';
    montageDetail = 'Vidéo montée — prête';
  } else if (video.status === 'rendering') {
    montageEtat = 'encours';
    montageDetail = 'Montage en cours';
  } else if (video.status === 'failed') {
    montageEtat = 'echec';
    montageDetail = 'Échec du montage';
  }
  const montage: Etape = { cle: 'montage', titre: 'Montage', detail: montageDetail, etat: montageEtat };

  // 6 — Publication (YouTube)
  let publiEtat: EtapeEtat = 'indispo';
  let publiDetail = 'Bientôt : publication YouTube';
  if (video.youtubeVideoId) {
    publiEtat = 'faite';
    publiDetail = 'Publiée sur YouTube';
  } else if (video.status === 'published') {
    publiEtat = 'faite';
    publiDetail = 'Publiée';
  }
  const publi: Etape = { cle: 'publication', titre: 'Publication', detail: publiDetail, etat: publiEtat };

  return [storyboard, voix, images, clips, montage, publi];
}
