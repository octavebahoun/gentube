import type { HyperframesScene, WordTiming } from '@/lib/storyboard/render';
import type { SubtitleStyle } from '@/lib/db/schema';
import { isVideoPath, kenBurns, ms, wordsOrFallback } from './plan';

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

  const captions =
    words.length > 0
      ? `<div class="captions captions-${subtitleStyle}" id="c${index}" data-layout-allow-overlap>${words
          .map(
            (word, wordIndex) =>
              `<span class="word" id="w${index}-${wordIndex}">${escapeHtml(
                word.text
              )}</span>`
          )
          .join('')}</div>`
      : '';

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
    ? `<div class="overlay" id="o${index}">${escapeHtml(
        scene.overlayText.text
      )}</div>`
    : '';

  // Le titre cinétique s'anime mot à mot ; chaque mot est donc un élément,
  // comme pour le karaoké.
  const kinetic = kineticMarkup(scene, index);
  const counter = counterMarkup(scene, index);

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
    media,
    card,
    captions ? '<div class="veil"></div>' : '',
    captions,
    overlay,
    kinetic,
    counter,
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

  return (
    `<video class="media clip" id="m${index}" src="${escapeHtml(
      encodeURI(scene.mediaPath)
    )}" data-start="${scene.startInSeconds}" ` +
    `data-duration="${scene.durationInSeconds}" data-track-index="${trackIndex}" ` +
    `data-volume="${volume}" data-playback-rate="${rate}" ` +
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
        `<audio id="sfx-${index}-${n}" src="${escapeHtml(sound.src)}" ` +
        `data-start="${ms(scene.startInSeconds + offset)}" ` +
        `data-duration="${ms(reste)}" ` +
        `data-track-index="${trackBase + n}" ` +
        `data-volume="${volume}"${sound.loop ? ' loop' : ''}></audio>`
      );
    })
    .join('\n      ');
}

/**
 * Le compteur : un chiffre, ce qu'il compte, et rien d'autre.
 *
 * La valeur affichée ici est celle d'arrivée, pas celle de départ. Un rendu qui
 * échouerait à jouer la timeline montrerait donc le bon chiffre, immobile,
 * plutôt qu'un zéro — c'est la panne la moins mauvaise.
 *
 * La variante `ring` ajoute un anneau dont le remplissage est piloté par une
 * variable CSS, pour qu'aucune géométrie ne soit calculée dans la page.
 */
export function counterMarkup(
  scene: HyperframesScene,
  index: number
): string {
  const counter = scene.counter;
  if (!counter) return '';

  const decimals = counter.decimals ?? 0;
  const shown =
    escapeHtml(counter.prefix ?? '') +
    counter.value.toFixed(decimals) +
    escapeHtml(counter.suffix ?? '');

  const label = counter.label
    ? `<div class="counter-label">${escapeHtml(counter.label)}</div>`
    : '';

  const digits = `<div class="counter-value" id="n${index}">${shown}</div>`;

  return (
    `<div class="counter counter-${escapeHtml(counter.variant ?? 'count')}">` +
    (counter.variant === 'ring'
      ? `<div class="counter-dial" id="g${index}">${digits}</div>`
      : digits) +
    label +
    '</div>'
  );
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
      .map(
        (word, wordIndex) =>
          `<span class="kt-word" id="k${index}-${wordIndex}">${escapeHtml(word)}</span>`
      )
      .join('') +
    '</div>'
  );
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
    `<audio id="voice-${index}" src="${escapeHtml(scene.audioPath)}" ` +
    `data-start="${scene.startInSeconds}" data-duration="${scene.narrationSeconds}" ` +
    `data-track-index="${trackBase + index}" data-volume="1"></audio>`
  );
}
