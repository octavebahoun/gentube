import type { HyperframesScene, WordTiming } from '@/lib/storyboard/render';
import type { SubtitleStyle } from '@/lib/db/schema';
import { isVideoPath, kenBurns, ms, wordLines, wordsOrFallback } from './plan';
import { effetsMarkup } from './effets';
import { manuscritMarkup } from './manuscrit';
import {
  chartMarkup,
  callToActionMarkup,
  comparisonMarkup,
  counterMarkup,
  listMarkup,
  lowerThirdMarkup,
  quoteMarkup,
  socialCardMarkup,
  threadMarkup,
} from './structures';
import { TITRE_PAR_LETTRE as PAR_LETTRE } from './plan';

/**
 * Le balisage d'une scène : son média, sa carte, ses sous-titres, son bandeau,
 * son titre cinétique, son éclair, et sa piste de voix.
 *
 * Rien ici ne calcule un instant ni une durée — tout arrive déjà décidé par
 * `./plan`. Ce fichier ne fait qu'écrire des chaînes.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sceneMarkup(
  scene: HyperframesScene,
  index: number,
  {
    subtitles,
    trackIndex,
    subtitleStyle,
  }: { subtitles: boolean; trackIndex: number; subtitleStyle: SubtitleStyle }
): string {
  // `showSubtitles` est une décision de scène, `subtitles` une décision de
  // vidéo. La première l'emporte quand elle est écrite : un titre plein cadre
  // ou un plan de respiration n'a pas à porter du texte parce que le reste de
  // la vidéo en porte.
  const montrer = scene.showSubtitles ?? subtitles;
  const words = montrer ? wordsOrFallback(scene) : [];

  // Les mots que la scène désigne comme porteurs de sens. Comparés sans casse
  // ni ponctuation : le modèle écrit « Dahomey », le mot rendu « Dahomey, ».
  const nu = (mot: string) =>
    mot.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const portants = new Set((scene.emphasis ?? []).map(nu));

  /*
   * Un conteneur par ligne, et c'est ce qui règle le conflit.
   *
   * Un mot s'allume et reste : sur une scène longue — une vidéo importée et
   * son transcript — les deux cents mots seraient tous à l'écran. Il faut donc
   * faire entrer et sortir des groupes.
   *
   * Mais quatre styles (`fondant`, `pill`, `gradient`, `blend`) pilotent déjà
   * l'`opacity` **du mot**. Animer la même propriété sur le même élément pour
   * deux raisons différentes, c'est deux tweens qui se battent. En posant le
   * groupe sur son propre `div`, chacun garde sa propriété : le conteneur
   * porte l'entrée et la sortie de la ligne, le mot porte sa révélation.
   *
   * `.captions` est déjà en position absolue, donc les lignes se superposent
   * sans une règle de plus. Une scène d'une seule ligne rend un seul `div`,
   * exactement comme avant.
   *
   * Les index de mots restent **globaux** : `w{scène}-{n}` est le n-ième mot
   * de la scène, pas de sa ligne. La timeline les vise ainsi, et elle n'a pas
   * à savoir comment on a découpé.
   */
  const lignes = wordLines(words);
  let compteur = 0;

  const captions = lignes
    .map((ligne, ligneIndex) => {
      const spans = ligne
        .map((word) => {
          const fort = portants.has(nu(word.text)) ? ' fort' : '';
          return `<span class="word${fort}" id="w${index}-${compteur++}">${escapeHtml(
            word.text
          )}</span>`;
        })
        .join('');

      // L'emoji accompagne la phrase, donc la dernière ligne : posé sur
      // chacune, il apparaîtrait autant de fois qu'il y a de lignes.
      const emoji =
        scene.emoji && ligneIndex === lignes.length - 1
          ? `<span class="word-emoji">${escapeHtml(scene.emoji)}</span>`
          : '';

      /*
       * Deux div par ligne, et ce n'est pas de la décoration.
       *
       * Une ligne doit entrer puis sortir. Posées toutes deux sur l'`opacity`
       * du même élément, l'entrée et la sortie se disputent la propriété : la
       * seconde animation applique son état de départ dès la construction de
       * la timeline, donc chaque ligne naît **visible** et les treize lignes
       * d'un transcript s'empilent dès la première image. C'est arrivé.
       *
       * L'enveloppe porte la sortie, le conteneur porte l'entrée. Deux
       * éléments, deux opacités, qui se multiplient au lieu de se battre.
       */
      return (
        `<div class="caption-line" id="o${index}-${ligneIndex}" ` +
        `data-layout-allow-overlap>` +
        `<div class="captions captions-${subtitleStyle}" ` +
        `id="c${index}-${ligneIndex}" data-layout-allow-overlap>` +
        `${spans}${emoji}</div></div>`
      );
    })
    .join('');

  // Une carte n'a pas d'image : c'est un écran noir avec du texte.
  //
  // Le chemin traverse deux couches d'échappement — CSS puis attribut HTML —
  // et `encodeURI` règle la première : il neutralise les guillemets et les
  // espaces sans toucher aux séparateurs de chemin.
  const media = mediaMarkup(scene, index);

  // Le texte d'une carte remplace le média, il ne s'y superpose pas.
  const card = scene.card
    ? `<div class="card">` +
      `<p class="card-text">${escapeHtml(scene.card.text)}</p>` +
      (scene.card.subtext
        ? `<p class="card-subtext">${escapeHtml(scene.card.subtext)}</p>`
        : '') +
      '</div>'
    : '';

  // Un bandeau posé sur l'image, distinct des sous-titres : il ne suit pas la
  // voix, il annonce ou commente.
  const overlay = scene.overlayText
    ? `<div class="overlay overlay-${escapeHtml(
        scene.overlayText.position ?? 'top'
      )}${scene.overlayText.accent ? ' overlay-accent' : ''}" id="o${index}">` +
      `${escapeHtml(scene.overlayText.text)}</div>`
    : '';

  // Le titre cinétique s'anime mot à mot ; chaque mot est donc un élément,
  // comme pour le karaoké.
  const kinetic = kineticMarkup(scene, index);
  const counter = counterMarkup(scene, index);
  const tiers = lowerThirdMarkup(scene, index);
  const chart = chartMarkup(scene, index);
  const thread = threadMarkup(scene, index);
  const quote = quoteMarkup(scene, index);
  const list = listMarkup(scene, index);
  const face = comparisonMarkup(scene, index);
  const social = socialCardMarkup(scene, index);
  const cta = callToActionMarkup(scene, index);

  /*
   * Le balayage et le grain : deux nappes dans la scène, comme l'éclair.
   *
   * Dans le div de la scène et non au-dessus : ils meurent avec elle. Un
   * voile posé au niveau du document survivrait au plan qu'il habille.
   *
   * `gr` et non `g` pour le grain : `g<index>` est déjà l'anneau du compteur,
   * et deux éléments sous le même identifiant se volent le tween.
   */
  // Les nappes déclarées dans `effets.ts` : les décors sous le média, le
  // reste au-dessus. Deux appels, une seule table.
  const decors = effetsMarkup(scene, index, true);
  const nappes = effetsMarkup(scene, index, false);
  // Les tracés à la main : au-dessus de tout, c'est une annotation.
  const manuscrit = manuscritMarkup(scene, index);

  const sweep = scene.effects?.lightSweep
    ? `<div class="light-sweep" id="ls${index}" style="--sweep-color:${escapeHtml(
        scene.effects.lightSweep.color ?? '#ffffff'
      )}"></div>`
    : '';

  const grain = scene.effects?.grain
    ? `<div class="grain" id="gr${index}"></div>`
    : '';

  // Un éclair est une nappe de couleur pleine trame. Elle est dans la scène
  // pour disparaître avec elle, jamais au-dessus du reste de la vidéo.
  const flash = scene.effects?.flash
    ? `<div class="flash" id="f${index}" style="background:${escapeHtml(
        scene.effects.flash.color ?? '#ffffff'
      )}"></div>`
    : '';

  // La piste vient de `trackPlan` : la 0 porte le fond, et `hyperframes check`
  // refuse deux clips qui se chevauchent sur la même piste — or le fond couvre
  // toute la vidéo, il chevauche donc forcément la première scène.
  return [
    `<div class="scene clip" id="s${index}" data-start="${scene.startInSeconds}" ` +
      `data-duration="${scene.durationInSeconds}" data-track-index="${trackIndex}">`,
    decors,
    media,
    card,
    captions ? '<div class="veil"></div>' : '',
    captions,
    overlay,
    tiers,
    kinetic,
    counter,
    chart,
    thread,
    quote,
    list,
    face,
    social,
    cta,
    nappes,
    manuscrit,
    sweep,
    grain,
    flash,
    '</div>',
  ]
    .filter(Boolean)
    .join('\n      ');
}

/**
 * Le média d'une scène : une image de fond, ou une balise vidéo.
 *
 * Les deux portent le même id `m<index>` — c'est lui que le zoom anime, et
 * c'est par lui que le moteur découvre un élément média. Un plan animé garde
 * donc exactement le même traitement caméra qu'une fixe.
 *
 * `data-volume` par défaut à 0 : un clip généré arrive avec sa propre bande
 * son, et la laisser passer sous la voix off produit deux audios qui se
 * marchent dessus. Une scène qui veut ce son le demande par `mediaVolume`.
 */
function mediaMarkup(scene: HyperframesScene, index: number): string {
  // Un plan animé n'a pas son média ici : une balise vidéo minutée imbriquée
  // dans une scène minutée sort **gelée** au rendu, le moteur ne sachant pas
  // laquelle des deux horloges commande. `hyperframes check` le refuse, et il
  // a raison. Les clips sont donc posés au niveau de la scène-mère par
  // `videoMarkup`, avec leur propre piste.
  if (!scene.mediaPath || isVideoPath(scene.mediaPath)) return '';

  const source = escapeHtml(encodeURI(scene.mediaPath));
  return `<div class="media" id="m${index}" style="background-image:url(&quot;${source}&quot;)"></div>`;
}

/**
 * Le clip d'un plan animé, posé au niveau de la scène-mère.
 *
 * Il porte `clip` pour rester invisible avant son instant, et son volume est
 * nul par défaut : un clip généré arrive avec sa propre bande son, et la
 * laisser passer sous la voix off produit deux audios qui se marchent dessus.
 */
export function videoMarkup(
  scene: HyperframesScene,
  index: number,
  trackIndex: number
): string {
  if (!scene.mediaPath || !isVideoPath(scene.mediaPath)) return '';

  const volume = scene.mediaVolume ?? 0;
  const rate = scene.playbackRate ?? 1;
  /*
   * Où entrer dans le fichier.
   *
   * Émis seulement quand il y a un décalage : le moteur le lit comme zéro par
   * défaut, et un attribut à zéro sur chaque plan généré n'apprendrait rien à
   * personne.
   *
   * C'est lui qui permet à plusieurs plans de partager un même fichier — une
   * vidéo apportée par le client découpée en scènes, au lieu d'un plan unique.
   * Le runtime cale le média par
   * `(temps - data-start) * data-playback-rate + data-media-start`, et le rendu
   * extrait images et son avec un `-ss` construit dessus.
   */
  const decalage = scene.mediaStart ?? 0;

  /*
   * Le recadrage, posé en CSS et non sur la timeline.
   *
   * Il est immobile par définition : l'animer en ferait un zoom, et un zoom
   * sur un clip se bat avec le mouvement propre de l'image. En CSS, il ne
   * traverse pas GSAP du tout.
   *
   * Les transformations CSS s'appliquent de droite à gauche : `scale` d'abord,
   * `translate` ensuite, dont le pourcentage se lit sur la taille **non
   * agrandie** de l'élément. Le décalage reste donc prévisible quel que soit
   * l'agrandissement.
   *
   * `video.media` est déjà en `object-fit: cover` à 112 %, et la racine de la
   * composition est en `overflow: hidden` : agrandir recadre pour de vrai.
   */
  const cadre = scene.reframe;
  const style = cadre
    ? ` style="transform: translate(0, ${cadre.y ?? 0}%) scale(${cadre.scale})"`
    : '';

  return (
    `<video class="media clip" id="m${index}"${style} src="${escapeHtml(
      encodeURI(scene.mediaPath)
    )}" data-start="${scene.startInSeconds}" ` +
    `data-duration="${scene.durationInSeconds}" data-track-index="${trackIndex}" ` +
    `data-volume="${volume}" data-playback-rate="${rate}" ` +
    (decalage > 0 ? `data-media-start="${decalage}" ` : '') +
    `preload="auto" playsinline${volume === 0 ? ' muted' : ''}></video>`
  );
}

/**
 * Les sons d'une scène : impact, ambiance, nappe.
 *
 * Une piste par son, sur sa propre bande de pistes — le moteur refuse deux
 * éléments qui se chevauchent sur la même. Chacun porte le seul vocabulaire
 * que le moteur lise : `data-start`, `data-duration`, `data-volume`,
 * `data-loop`.
 *
 * La durée est celle qu'il reste à la scène après le décalage du son, et non
 * celle du fichier, qu'on ne connaît pas ici. Un son plus court s'arrête tout
 * seul ; un son plus long est coupé avec sa scène, ce qui est le comportement
 * voulu — un impact ne survit pas au plan qu'il ponctue.
 *
 * Le volume est celui du son multiplié par le `sfxVolume` de la vidéo : le
 * premier est une intention de mise en scène, le second un réglage global.
 */
export function soundsMarkup(
  scene: HyperframesScene,
  index: number,
  { trackBase, sfxVolume }: { trackBase: number; sfxVolume: number }
): string {
  const sounds = scene.sounds ?? [];

  return sounds
    .map((sound, n) => {
      const offset = sound.startInSeconds ?? 0;
      const reste = Math.max(0.05, scene.durationInSeconds - offset);
      const volume = (sound.volume ?? 1) * sfxVolume;

      return (
        // `encodeURI` comme pour les images : une clé du catalogue contenant
        // un espace ou un dièse produisait un `src` cassé, et la piste
        // disparaissait sans erreur.
        `<audio id="sfx-${index}-${n}" src="${escapeHtml(encodeURI(sound.src))}" ` +
        `data-start="${ms(scene.startInSeconds + offset)}" ` +
        `data-duration="${ms(reste)}" ` +
        `data-track-index="${trackBase + n}" ` +
        `data-volume="${volume}"${sound.loop ? ' loop' : ''}></audio>`
      );
    })
    .join('\n      ');
}

/**
 * Le titre cinétique, un élément par mot.
 *
 * La variante décide de l'apparence en CSS ; le décalage entre les mots est
 * une donnée de timeline, calculée ici pour que la page n'ait aucun calcul de
 * temps à faire.
 */
function kineticMarkup(scene: HyperframesScene, index: number): string {
  const title = scene.kineticTitle;
  if (!title) return '';

  const words = title.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const style = [
    title.fontSize ? `font-size:${escapeHtml(title.fontSize)}` : '',
    title.highlightColor ? `--kt-accent:${escapeHtml(title.highlightColor)}` : '',
    title.glowColor ? `--kt-glow:${escapeHtml(title.glowColor)}` : '',
  ]
    .filter(Boolean)
    .join(';');

  const icon =
    title.variant === 'icon' && title.icon
      ? `<span class="kt-icon" aria-hidden="true">${escapeHtml(title.icon)}</span>` +
        (title.iconLabel
          ? `<span class="kt-icon-label">${escapeHtml(title.iconLabel)}</span>`
          : '')
      : '';

  return (
    `<div class="kinetic kt-${escapeHtml(title.variant ?? 'reveal')} ` +
    `kt-${escapeHtml(title.position ?? 'center')}"${style ? ` style="${style}"` : ''}>` +
    icon +
    words
      .map((word, wordIndex) => lettres(word, index, wordIndex, title.variant))
      .join('') +
    '</div>'
  );
}

/**
 * Trois variantes animent la lettre, les autres le mot.
 *
 * Les lettres sont enveloppées **dans** leur mot plutôt que posées à plat :
 * sans ça un titre se couperait n'importe où en fin de ligne, au milieu d'un
 * mot. Le mot reste l'unité de retour à la ligne, la lettre devient l'unité
 * d'animation.
 */

function lettres(
  word: string,
  index: number,
  wordIndex: number,
  variant?: string
): string {
  const id = `k${index}-${wordIndex}`;
  if (!variant || !PAR_LETTRE.has(variant)) {
    return `<span class="kt-word" id="${id}">${escapeHtml(word)}</span>`;
  }

  const chars = [...word]
    .map(
      (char, i) =>
        `<span class="kt-char" id="${id}-${i}">${escapeHtml(char)}</span>`
    )
    .join('');
  return `<span class="kt-word" id="${id}">${chars}</span>`;
}

/**
 * La piste de voix d'une scène.
 *
 * Sa durée est `narrationSeconds`, pas `durationInSeconds` : l'image reste à
 * l'écran après la fin de la phrase, la voix non. Confondre les deux fait
 * jouer la voix d'une scène par-dessus la suivante.
 */
export function audioMarkup(
  scene: HyperframesScene,
  index: number,
  trackBase: number
): string {
  if (!scene.audioPath) return '';
  // L'`id` n'est pas cosmétique : le moteur découvre les éléments média par
  // leur id. Sans lui, la piste est ignorée et la vidéo sort **muette**, sans
  // qu'aucune erreur ne soit levée.
  return (
    `<audio id="voice-${index}" src="${escapeHtml(encodeURI(scene.audioPath))}" ` +
    `data-start="${scene.startInSeconds}" data-duration="${scene.narrationSeconds}" ` +
    `data-track-index="${trackBase + index}" data-volume="1"></audio>`
  );
}

/**
 * Réexports de compatibilité.
 *
 * Le balisage des plans structurés vit dans `structures.ts` depuis le
 * 3 septembre 2026 ; les tests et `preview.ts` importent encore d'ici.
 */
export {
  chartMarkup,
  comparisonMarkup,
  counterMarkup,
  listMarkup,
  lowerThirdMarkup,
  quoteMarkup,
  threadMarkup,
} from './structures';
