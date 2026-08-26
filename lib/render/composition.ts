import type {
  HyperframesScene,
  HyperframesStoryboard,
  WordTiming,
} from '@/lib/storyboard/render';
import { transitionDurationSeconds } from '@/lib/storyboard/render';

/**
 * Génère l'`index.html` que HyperFrames rend.
 *
 * **Pourquoi générer plutôt que templater.** Une composition GenTube n'a pas
 * un nombre de scènes fixe : elle en a autant que le storyboard, chacune avec
 * sa durée mesurée, son image, sa piste audio et ses timings mot à mot. Les
 * modèles livrés avec HyperFrames substituent des marqueurs dans un HTML
 * statique — ça marche pour trois scènes connues d'avance, pas pour N.
 *
 * **Pourquoi pas construire le DOM en JavaScript dans la page.** Le moteur lit
 * les `data-start` et `data-duration` **du DOM**, et rien ne garantit qu'il
 * rescanne après qu'un script ait ajouté des éléments. Le HTML sort d'ici déjà
 * complet : le moteur trouve la timeline entière au chargement.
 *
 * **La règle qui gouverne tout le reste** : le moteur **cherche chaque image**
 * (`seek`) au lieu de jouer la vidéo. Une animation qui accumule du temps
 * marche dans l'aperçu et se casse au rendu. Toutes les animations d'ici sont
 * des `fromTo` posés à un instant absolu — la seule forme qui survit à un saut
 * arrière.
 */

/**
 * Le projet HyperFrames : `hyperframes.json`, `style.css` et `vendor/gsap`.
 * Un rendu recopie ce dossier dans un répertoire temporaire, y dépose les
 * médias et l'`index.html` généré, puis le jette.
 */
export const COMPOSITION_DIR = 'render/gentube-v1';

/** Taille de police des sous-titres, en fraction de la hauteur de trame. */
const SUBTITLE_HEIGHT_RATIO = 0.058;
const WATERMARK_HEIGHT_RATIO = 0.032;

/** Amplitude du zoom lent sur une image fixe. 6 % sur toute la scène. */
const KEN_BURNS_SCALE = 1.06;

export type CompositionInput = {
  storyboard: HyperframesStoryboard;
  /** Pose la marque GenTube. Décidé au débit, pas ici. */
  watermark?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Échappe une chaîne pour l'intérieur d'un littéral JavaScript entre
 * apostrophes doubles. `JSON.stringify` fait le travail, sauf pour `</script`
 * qui fermerait la balise depuis l'intérieur d'une chaîne — un titre de vidéo
 * est du texte fourni par l'utilisateur.
 */
function js(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

/** Arrondi à la milliseconde, comme le reste du contrat de rendu. */
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * Le zoom d'une scène, sous forme d'échelles de départ et d'arrivée.
 *
 * `none` ne rend pas une image parfaitement immobile : un plan fixe absolu au
 * milieu de plans animés se lit comme une image figée, pas comme un choix. Il
 * garde donc une dérive minuscule.
 */
export function kenBurns(zoom?: string): { from: number; to: number } {
  if (zoom === 'out') return { from: KEN_BURNS_SCALE, to: 1 };
  if (zoom === 'none') return { from: 1, to: 1.01 };
  return { from: 1, to: KEN_BURNS_SCALE };
}

/**
 * Le fondu d'entrée d'une scène.
 *
 * `sceneStartTimes()` a déjà reculé chaque scène de la durée de sa propre
 * transition, donc les scènes se chevauchent : il suffit de faire monter
 * l'opacité de celle qui arrive pour obtenir un fondu enchaîné.
 *
 * La première scène ne reçoit aucun fondu — elle ouvre la vidéo, il n'y a
 * rien sous elle. Une coupe franche (`none`) non plus.
 *
 * Seules les transitions CSS sont rendues ici. Les 14 transitions shader de
 * `@hyperframes/shader-transitions` demandent le paquet et un canvas WebGL :
 * elles tomberont sur un fondu tant qu'il n'est pas installé, plutôt que de
 * faire échouer un rendu.
 */
export function fadeInSeconds(scene: HyperframesScene, index: number): number {
  if (index === 0) return 0;
  const transition = scene.effects?.transition;
  if (transition === 'none') return 0;
  return transitionDurationSeconds(transition);
}

/**
 * Découpe la narration en mots quand la voix off n'a pas fourni d'alignement.
 *
 * Sans timings, on ne peut pas allumer les mots un par un — mais afficher le
 * texte vaut mieux que ne rien afficher, donc chaque mot reçoit une part égale
 * de la narration. C'est visiblement moins bon, et c'est le but : on doit voir
 * qu'un alignement manque.
 */
export function wordsOrFallback(
  scene: HyperframesScene
): WordTiming[] {
  if (scene.words && scene.words.length > 0) return scene.words;

  const spoken = (scene.subtitle ?? scene.narration ?? '').trim();
  if (!spoken) return [];

  const parts = spoken.split(/\s+/);
  const each = scene.narrationSeconds / parts.length;
  return parts.map((text, index) => ({
    text,
    start: ms(index * each),
    duration: ms(each),
  }));
}

/*
 * `data-layout-allow-overlap` sur les sous-titres : pendant un fondu enchaîné,
 * les mots de la scène sortante et ceux de la scène entrante occupent la même
 * bande. C'est ce qu'un fondu fait, et les deux sont à demi transparents à cet
 * instant. Sans cette marque, `hyperframes check` le signale à chaque couture.
 */
function sceneMarkup(
  scene: HyperframesScene,
  index: number,
  { subtitles }: { subtitles: boolean }
): string {
  const words = subtitles ? wordsOrFallback(scene) : [];

  const captions =
    words.length > 0
      ? `<div class="captions" data-layout-allow-overlap>${words
          .map(
            (word, wordIndex) =>
              `<span class="word" id="w${index}-${wordIndex}">${escapeHtml(
                word.text
              )}</span>`
          )
          .join('')}</div>`
      : '';

  // Une carte de fin n'a pas d'image : c'est un écran noir avec du texte.
  //
  // Le chemin traverse deux couches d'échappement — CSS puis attribut HTML —
  // et `encodeURI` règle la première : il neutralise les guillemets et les
  // espaces sans toucher aux séparateurs de chemin.
  const media = scene.mediaPath
    ? `<div class="media" id="m${index}" style="background-image:url(&quot;${escapeHtml(
        encodeURI(scene.mediaPath)
      )}&quot;)"></div>`
    : '';

  // Piste `index + 1` : la 0 porte le fond. `hyperframes check` refuse deux
  // clips qui se chevauchent sur la même piste, et le fond couvre toute la
  // vidéo — il chevauche donc forcément la première scène.
  return [
    `<div class="scene clip" id="s${index}" data-start="${scene.startInSeconds}" ` +
      `data-duration="${scene.durationInSeconds}" data-track-index="${index + 1}">`,
    media,
    captions ? '<div class="veil"></div>' : '',
    captions,
    '</div>',
  ]
    .filter(Boolean)
    .join('\n      ');
}

/**
 * La piste de voix d'une scène.
 *
 * Sa durée est `narrationSeconds`, pas `durationInSeconds` : l'image reste à
 * l'écran après la fin de la phrase, la voix non. Confondre les deux fait
 * jouer la voix d'une scène par-dessus la suivante.
 */
function audioMarkup(
  scene: HyperframesScene,
  index: number,
  trackBase: number
): string {
  if (!scene.audioPath) return '';
  // L'`id` n'est pas cosmétique : le moteur découvre les éléments média par
  // leur id. Sans lui, la piste est ignorée et la vidéo sort **muette**, sans
  // qu'aucune erreur ne soit levée.
  return (
    `<audio id="voice-${index}" src="${escapeHtml(scene.audioPath)}" ` +
    `data-start="${scene.startInSeconds}" data-duration="${scene.narrationSeconds}" ` +
    `data-track-index="${trackBase + index}" data-volume="1"></audio>`
  );
}

export function composeHtml({
  storyboard,
  watermark = false,
}: CompositionInput): string {
  const { width, height, durationInSeconds, scenes } = storyboard;
  const audioTrackBase = scenes.length + 10;

  const subtitleSize = Math.round(height * SUBTITLE_HEIGHT_RATIO);
  const watermarkSize = Math.round(height * WATERMARK_HEIGHT_RATIO);

  const music = storyboard.music
    ? `<audio id="music" src="${escapeHtml(storyboard.music)}" data-start="0" ` +
      `data-duration="${durationInSeconds}" data-track-index="${audioTrackBase - 1}" ` +
      `data-volume="${storyboard.musicVolume}" loop></audio>`
    : '';

  const watermarkMarkup = watermark
    ? `<div class="watermark clip" id="watermark" data-start="0" ` +
      `data-duration="${durationInSeconds}" ` +
      `data-track-index="${audioTrackBase - 2}">` +
      `<span class="dot" style="width:${Math.round(watermarkSize * 0.5)}px;` +
      `height:${Math.round(watermarkSize * 0.5)}px"></span>GenTube</div>`
    : '';

  // Le script embarque exactement ce dont il a besoin : des instants absolus
  // et des cibles. Aucun calcul de temps ne se fait dans la page.
  const timeline = {
    scenes: scenes.map((scene, index) => ({
      index,
      start: scene.startInSeconds,
      duration: scene.durationInSeconds,
      fade: fadeInSeconds(scene, index),
      hasMedia: Boolean(scene.mediaPath),
      zoom: kenBurns(scene.effects?.zoom),
      words: (storyboard.subtitles ? wordsOrFallback(scene) : []).map(
        (word) => ({ at: ms(scene.startInSeconds + word.start) })
      ),
    })),
  };

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${escapeHtml(storyboard.title)}</title>
    <script src="vendor/gsap.min.js"></script>
    <link rel="stylesheet" href="style.css" />
    <style>
      html, body { width: ${width}px; height: ${height}px; }
      .captions { font-size: ${subtitleSize}px; }
      .watermark { font-size: ${watermarkSize}px; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${durationInSeconds}"
      data-width="${width}"
      data-height="${height}"
    >
      <div id="bg" class="clip" data-start="0" data-duration="${durationInSeconds}" data-track-index="0"></div>
      ${scenes
        .map((scene, index) =>
          sceneMarkup(scene, index, { subtitles: storyboard.subtitles })
        )
        .join('\n      ')}
      ${watermarkMarkup}
      ${scenes
        .map((scene, index) => audioMarkup(scene, index, audioTrackBase))
        .filter(Boolean)
        .join('\n      ')}
      ${music}
    </div>

    <script>
      // Tout en fromTo, jamais en to : c'est la seule forme qui survit à un
      // seek arrière, donc la seule sûre quand le moteur cherche chaque image
      // au lieu de jouer.
      const T = ${js(timeline)};
      const tl = gsap.timeline({ paused: true });

      for (const scene of T.scenes) {
        if (scene.fade > 0) {
          tl.fromTo(
            "#s" + scene.index,
            { opacity: 0 },
            { opacity: 1, duration: scene.fade, ease: "power2.inOut" },
            scene.start
          );
        }

        if (scene.hasMedia) {
          tl.fromTo(
            "#m" + scene.index,
            { scale: scene.zoom.from },
            { scale: scene.zoom.to, duration: scene.duration, ease: "none" },
            scene.start
          );
        }

        // Le mot s'allume à son instant et le reste : c'est la lecture
        // karaoké. Une durée nulle serait ignorée par GSAP, d'où le millième.
        scene.words.forEach(function (word, i) {
          tl.fromTo(
            "#w" + scene.index + "-" + i,
            { color: "rgba(255,255,255,0.42)" },
            { color: "#ffffff", duration: 0.001, ease: "none" },
            word.at
          );
        });
      }

      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
