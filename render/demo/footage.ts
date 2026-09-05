import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import 'dotenv/config';
import type { Ratio, Resolution, Shot, Video } from '@/lib/db/schema';
import { MAX_AUDIO_BYTES, createTranscriber } from '@/lib/transcribe/whisper';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { habille } from '@/lib/storyboard/registres';
import { decouperLimport } from '@/lib/storyboard/decoupage';

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
 * **C'est un vrai montage, pas un plan habillé.** La vidéo est découpée en
 * plusieurs plans qui entrent dans le même fichier à des endroits différents,
 * et `habille()` leur donne transitions et zooms selon leur place dans le
 * film — une ouverture s'ouvre, une fermeture ferme.
 *
 * On a longtemps écrit ici qu'aucun décalage n'existait dans le fichier, qu'une
 * scène jouait toujours son média depuis zéro, et que l'import devait donc
 * rester un plan unique. C'était faux. Vérifié le 5 septembre 2026 dans la
 * source de HyperFrames, sur ses deux chemins : le runtime cale le média par
 * `(temps - data-start) * data-playback-rate + data-media-start`, et le rendu
 * extrait les images comme la piste son avec un `-ss` construit sur ce même
 * décalage. Il ne manquait que l'attribut, que nous n'émettions pas.
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
   * Les plans, taillés dans le fichier du client.
   *
   * `decouperLimport` coupe dans les silences de la bande son, dans les bornes
   * de rythme du registre. Chaque plan entre dans le même fichier à son propre
   * `mediaStart`, et `habille()` lui donne sa transition et son zoom selon sa
   * place — c'est là que le montage devient un montage.
   */
  const plans = decouperLimport(transcript.words, duree, 'explainer');
  log(`        ${plans.length} plans taillés dans les silences`);

  /*
   * `assetUrl` porte le fichier : `submitClips` et `generateImages` n'ont rien
   * à faire ici, et en production c'est exactement ce que `bindAssetToShot`
   * écrit. `sourceImageUrl` reste vide — une vidéo ne sert pas d'image de
   * départ à un modèle d'animation.
   *
   * `mediaVolume: 1` est le point qui distingue ce cas de tous les autres :
   * un clip généré arrive muet et la voix off passe par-dessus, alors qu'ici
   * la bande son **est** celle du client. La couper serait livrer une vidéo
   * muette.
   *
   * `zoom: 'none'` sur chaque plan : l'image bouge déjà d'elle-même, et un
   * zoom par-dessus se battrait avec son propre mouvement.
   *
   * **Et `transition: 'none'` — des coupes franches, pas des fondus.** Une
   * transition fait reculer la scène suivante de sa propre durée, pour que le
   * chevauchement tombe dans le fondu : c'est juste quand chaque plan est muet
   * et que la voix off passe au-dessus. Ici chaque plan porte la bande son du
   * client, et deux plans qui se chevauchent font jouer **deux fois** la même
   * bande, décalée d'une demi-seconde. Un écho.
   *
   * Ce n'est pas une privation : sur une source continue, le rythme du montage
   * vient de l'endroit où tombent les coupes, pas de l'effet posé entre elles.
   * `habille()` reste appelé pour ce qu'il décide d'autre.
   */
  const shots = plans.map((plan, index) => ({
    id: index + 1,
    order: index + 1,
    type: 'video',
    prompt: '',
    narration: plan.words.map((mot) => mot.text).join(' '),
    subtitle: null,
    audioUrl: null,
    assetUrl: media,
    sourceImageUrl: null,
    durationS: plan.durationS,
    durationSource: 'measured',
    words: plan.words,
    render: {
      mediaVolume: 1,
      mediaStart: plan.mediaStart,
      effects: {
        ...habille('explainer', 'pose', index, plans.length),
        zoom: 'none',
        transition: 'none',
      },
    },
  })) as unknown as Shot[];

  const storyboard = toHyperframesStoryboard(video, shots);
  const page = composeHtml({ storyboard, watermark: true });
  const target = join(COMPOSITION_DIR, 'index.html');
  writeFileSync(target, page);

  const lignes = (page.match(/class="captions /g) ?? []).length;

  /*
   * La composition dure plus longtemps que le fichier, et d'une seconde par
   * plan.
   *
   * `POST_NARRATION_PAUSE_SECONDS` : une respiration prévue pour une voix de
   * synthèse, appliquée à toute scène sans carte. Sur un import découpé, elle
   * fige la dernière image de chaque plan avant la coupe — un temps de lecture
   * en fin de plan, ce qui tombe bien, mais aussi un arrêt sur image au milieu
   * du montage, ce qui se voit. C'est le prochain point à traiter.
   */
  log(
    `\n${target}\n` +
      `${storyboard.scenes.length} plans · ${storyboard.durationInSeconds.toFixed(1)}s ` +
      `pour ${duree.toFixed(1)}s de source · ${storyboard.width}×${storyboard.height} · ` +
      `${lignes} lignes de sous-titre\n\n` +
      `  npx tsx render/demo/render.ts render/demo/${nom}-habille.mp4`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
