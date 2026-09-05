import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import 'dotenv/config';
import type { Ratio, Resolution, Shot, Video } from '@/lib/db/schema';
import { MAX_AUDIO_BYTES, createTranscriber } from '@/lib/transcribe/whisper';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { habille } from '@/lib/storyboard/registres';

/**
 * Le cas d'usage 4 : le client apporte sa vidéo, on l'habille.
 *
 *   npx tsx render/demo/footage.ts /chemin/vers/sa-video.mp4
 *   npx tsx render/demo/render.ts render/demo/import.mp4
 *
 * **Tout part du fichier vidéo, et rien d'autre.** La bande son, la durée, le
 * ratio et la résolution en sont déduits ; le transcript est demandé une fois
 * puis mis en cache. Aucune étape à faire à la main : cette démonstration
 * était irreproductible parce qu'elle attendait un MP4 découpé et un MP3
 * extrait par avance, tous deux hors du dépôt.
 *
 * Rien n'est généré — ni image, ni clip, ni voix. La seule dépense est la
 * transcription, et elle sert à une chose : caler les sous-titres au mot sur
 * une bande son que personne n'a écrite.
 *
 * **Pourquoi une seule scène, pour le moment.** Cette démonstration ne pose
 * qu'un plan, et ce n'est plus une contrainte du moteur : c'est simplement ce
 * qui est branché.
 *
 * On a longtemps écrit ici qu'aucun décalage n'existait dans le fichier —
 * qu'une scène jouait toujours son média depuis zéro — et c'était faux.
 * Vérifié le 5 septembre 2026 dans la source de HyperFrames, sur les deux
 * chemins : le runtime cale le média par
 * `(temps - data-start) * data-playback-rate + data-media-start`, et le rendu
 * extrait les images comme la piste son avec un `-ss` construit sur ce même
 * `data-media-start`. Rien dans le moteur n'empêche de découper un import en
 * plusieurs plans.
 *
 * Ce qui manque est de notre côté : `markup.ts` n'émet pas l'attribut, et
 * aucun champ du contrat de rendu ne le porte. Tant que c'est le cas, la vidéo
 * est **un seul plan** et ce sont les lignes de sous-titre qui se succèdent
 * au-dessus — ce que `wordLines()` découpe.
 */

/** Où vivent l'audio extrait et le transcript : hors du dépôt, ils sont dérivés. */
const CACHE_DIR = 'render/demo/imports';

const log = (message: string) => console.log(message);

function ffprobe(video: string, champs: string): string {
  return execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', champs, '-of', 'csv=p=0', video],
    { encoding: 'utf8' }
  ).trim();
}

/**
 * Ce que le fichier dit de lui-même.
 *
 * La durée est **lue**, pas devinée : une vidéo plus longue que la scène est
 * coupée, plus courte laisse un écran figé. `FOOTAGE_SECONDS` la surchargeait,
 * ce qui revenait à demander au développeur ce que le fichier savait déjà.
 */
function mesure(video: string) {
  const duree = Number(ffprobe(video, 'format=duration'));
  const [largeur, hauteur] = ffprobe(video, 'stream=width,height')
    .split(/[\n,]/)
    .map(Number);

  if (!Number.isFinite(duree) || duree <= 0) {
    throw new Error(`ffprobe ne lit pas de durée dans ${video}.`);
  }

  return { duree, largeur, hauteur };
}

/**
 * Le ratio et la résolution de sortie, déduits du fichier.
 *
 * Le moteur n'en connaît que deux, paysage et portrait — pas de carré. Un
 * fichier carré part donc en paysage et sera bordé : c'est visible, mais moins
 * qu'une image étirée, et ça reste la décision du moteur, pas de cette démo.
 *
 * La résolution descend au palier en dessous de la hauteur réelle : remonter
 * un 480p en 720p ne fabrique aucun détail, ça multiplie juste le coût de
 * rendu par trois.
 */
function cadre(largeur: number, hauteur: number): {
  ratio: Ratio;
  resolution: Resolution;
} {
  const ratio: Ratio = largeur >= hauteur ? '16:9' : '9:16';
  const cote = ratio === '9:16' ? largeur : hauteur;
  return { ratio, resolution: cote >= 720 ? '720p' : '480p' };
}

/**
 * Extrait la bande son, en mono 16 kHz.
 *
 * Whisper ramène tout à 16 kHz mono de toute façon : le faire ici divise le
 * poids par quatre face au plafond de 25 Mo de Workers AI, soit une heure
 * d'audio au lieu d'un quart d'heure.
 *
 * **Cette étape est locale, et c'est le trou qui reste avant la production.**
 * Il n'y a pas de ffmpeg en serverless. Côté plateforme, l'extraction devra se
 * faire dans le navigateur du client au moment du dépôt, là où le fichier est
 * déjà.
 */
function extraitLaudio(video: string, cible: string): string {
  if (existsSync(cible)) {
    log(`audio repris de ${cible}`);
    return cible;
  }

  log('extraction de la bande son — ffmpeg local');
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-i', video,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-b:a', '64k',
    cible,
  ]);

  const poids = statSync(cible).size;
  if (poids > MAX_AUDIO_BYTES) {
    throw new Error(
      `La bande son pèse ${(poids / 1e6).toFixed(0)} Mo, au-delà des ` +
        `${MAX_AUDIO_BYTES / 1e6} Mo de Workers AI. Découpe la vidéo.`
    );
  }
  return cible;
}

async function transcrit(audio: string, cache: string) {
  if (existsSync(cache)) {
    log(`transcript repris de ${cache}`);
    return JSON.parse(readFileSync(cache, 'utf8')) as {
      text: string;
      words: { text: string; start: number; duration: number }[];
      language?: string;
    };
  }

  log('transcription — Whisper sur Workers AI');
  const sortie = await createTranscriber().transcribe(readFileSync(audio));
  writeFileSync(cache, JSON.stringify(sortie, null, 2));
  return sortie;
}

async function main() {
  const source = process.argv[2];
  if (!source || !existsSync(source)) {
    throw new Error(
      'Donne le chemin de la vidéo du client :\n' +
        '  npx tsx render/demo/footage.ts /chemin/vers/sa-video.mp4'
    );
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  const nom = basename(source, extname(source));
  const { duree, largeur, hauteur } = mesure(source);
  const { ratio, resolution } = cadre(largeur, hauteur);

  log(`source  ${source}`);
  log(`        ${largeur}×${hauteur} · ${duree.toFixed(1)}s → ${ratio} ${resolution}`);

  // Le fichier doit vivre dans le dossier de composition : Chrome le charge
  // par un chemin relatif à la page, pas depuis n'importe où sur le disque.
  // En production c'est ce que `bindAssetToShot` écrit depuis R2.
  const media = `media/import-${nom}${extname(source)}`;
  mkdirSync(join(COMPOSITION_DIR, 'media'), { recursive: true });
  copyFileSync(source, join(COMPOSITION_DIR, media));

  const audio = extraitLaudio(source, join(CACHE_DIR, `${nom}.mp3`));
  const transcript = await transcrit(audio, join(CACHE_DIR, `${nom}.json`));

  log(`        ${transcript.words.length} mots · langue ${transcript.language ?? '?'}`);
  log(`        « ${transcript.text.slice(0, 100)}… »`);

  const video = {
    title: nom,
    ratio,
    resolution,
    voice: null,
    subtitles: true,
    subtitleStyle: 'karaoke',
    musicUrl: null,
    musicVolume: 0,
    sfxVolume: 1,
  } as unknown as Video;

  /*
   * Un plan unique, et c'est la vidéo du client.
   *
   * `assetUrl` porte le fichier : `submitClips` et `generateImages` n'ont rien
   * à faire ici, et en production c'est exactement ce que `bindAssetToShot`
   * écrit. `sourceImageUrl` reste vide — une vidéo ne sert pas d'image de
   * départ à un modèle d'animation.
   *
   * `mediaVolume: 1` est le point qui distingue ce cas de tous les autres :
   * un clip généré arrive muet et la voix off passe par-dessus, alors qu'ici
   * la bande son **est** celle du client. La couper serait livrer une vidéo
   * muette.
   */
  const shot = {
    id: 1,
    order: 1,
    type: 'video',
    prompt: '',
    narration: transcript.text,
    subtitle: null,
    audioUrl: null,
    assetUrl: media,
    sourceImageUrl: null,
    durationS: duree,
    durationSource: 'measured',
    words: transcript.words,
    render: {
      mediaVolume: 1,
      // Une seule scène : ni transition à jouer, ni zoom à poser sur un plan
      // qui porte déjà son propre mouvement.
      effects: { ...habille('explainer', 'pose', 0, 1), zoom: 'none' },
    },
  } as unknown as Shot;

  const storyboard = toHyperframesStoryboard(video, [shot]);
  const page = composeHtml({ storyboard, watermark: true });
  const target = join(COMPOSITION_DIR, 'index.html');
  writeFileSync(target, page);

  const lignes = (page.match(/class="captions /g) ?? []).length;

  /*
   * La composition dure une seconde de plus que le fichier.
   *
   * `POST_NARRATION_PAUSE_SECONDS` : une respiration prévue pour une voix de
   * synthèse, qui s'applique à toute scène sans carte. Sur un clip importé
   * elle laisse la dernière image figée — et c'est exactement le temps qu'il
   * faut pour finir de lire la dernière ligne de sous-titre. Gardée pour ça.
   */
  log(
    `\n${target}\n` +
      `1 plan importé · ${storyboard.durationInSeconds.toFixed(1)}s ` +
      `(dont 1s de lecture en fin) · ${storyboard.width}×${storyboard.height} · ` +
      `${lignes} lignes de sous-titre\n\n` +
      `  npx tsx render/demo/render.ts render/demo/${nom}-habille.mp4`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
