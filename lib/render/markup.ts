import type { HyperframesScene, WordTiming } from '@/lib/storyboard/render';
import type { SubtitleStyle } from '@/lib/db/schema';
import { chartPoints, isVideoPath, kenBurns, ms, wordsOrFallback } from './plan';
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

  const captions =
    words.length > 0
      ? `<div class="captions captions-${subtitleStyle}" id="c${index}" data-layout-allow-overlap>${words
          .map((word, wordIndex) => {
            const fort = portants.has(nu(word.text)) ? ' fort' : '';
            return `<span class="word${fort}" id="w${index}-${wordIndex}">${escapeHtml(
              word.text
            )}</span>`;
          })
          .join('')}${
          scene.emoji
            ? `<span class="word-emoji">${escapeHtml(scene.emoji)}</span>`
            : ''
        }</div>`
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
  const tiers = lowerThirdMarkup(scene, index);
  const chart = chartMarkup(scene, index);

  /*
   * Le balayage et le grain : deux nappes dans la scène, comme l'éclair.
   *
   * Dans le div de la scène et non au-dessus : ils meurent avec elle. Un
   * voile posé au niveau du document survivrait au plan qu'il habille.
   *
   * `gr` et non `g` pour le grain : `g<index>` est déjà l'anneau du compteur,
   * et deux éléments sous le même identifiant se volent le tween.
   */
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
    media,
    card,
    captions ? '<div class="veil"></div>' : '',
    captions,
    overlay,
    tiers,
    kinetic,
    counter,
    chart,
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
 * Le tiers inférieur : deux lignes, deux rangs.
 *
 * Le nom et la fonction sont deux éléments distincts et non une chaîne
 * assemblée ici, parce que c'est la feuille de style qui décide de leur
 * hiérarchie — taille, graisse, couleur. Les coller en un seul texte
 * rendrait ce choix impossible, et c'est toute la raison d'être du champ.
 *
 * `--lt-accent` plutôt qu'une couleur écrite dans chaque règle : les trois
 * variantes s'en servent à trois endroits différents — le filet, le cartouche,
 * le nom — et une seule variable les sert toutes.
 */
export function lowerThirdMarkup(
  scene: HyperframesScene,
  index: number
): string {
  const tiers = scene.lowerThird;
  if (!tiers) return '';

  const role = tiers.role
    ? `<div class="lt-role">${escapeHtml(tiers.role)}</div>`
    : '';

  const style = tiers.accentColor
    ? ` style="--lt-accent:${escapeHtml(tiers.accentColor)}"`
    : '';

  return (
    `<div class="lower-third lt-${escapeHtml(tiers.variant ?? 'bar')} ` +
    `lt-${escapeHtml(tiers.side ?? 'left')}" id="t${index}"${style}>` +
    `<div class="lt-name">${escapeHtml(tiers.name)}</div>` +
    role +
    '</div>'
  );
}

/**
 * Le graphique : des barres, ou une courbe.
 *
 * Aucune géométrie n'est calculée ici ni dans la page. `plan.ts` a déjà réduit
 * chaque valeur à une fraction de l'échelle et, pour la courbe, projeté les
 * points dans un carré de 100 sur 100 — le SVG s'étire ensuite avec son
 * conteneur. Une largeur en pixels calculée au rendu dépendrait de la police
 * chargée, donc du réseau, donc du jour.
 *
 * La barre est pilotée par `--part`, que la timeline fait monter de 0 à sa
 * fraction. Animer une variable CSS plutôt qu'une hauteur évite de faire
 * recalculer la mise en page à chaque image.
 *
 * Le chiffre affiché est celui d'arrivée : un rendu qui échouerait à jouer la
 * timeline montrerait les bonnes valeurs, immobiles.
 *
 * `chart-column` et non `chart-bar` pour une colonne : le conteneur porte déjà
 * `chart-<type>` comme modificateur, et sous le même nom il héritait de la
 * largeur d'une barre — le graphique entier se serrait dans un dixième du
 * cadre. Exactement la panne que l'anneau du compteur avait eue avant lui.
 */
export function chartMarkup(scene: HyperframesScene, index: number): string {
  const chart = scene.chart;
  if (!chart) return '';

  const decimals = chart.decimals ?? 0;
  const echelle = chart.max ?? Math.max(...chart.points.map((p) => p.value));
  const kind = chart.kind ?? 'bar';

  const titre = chart.title
    ? `<div class="chart-title">${escapeHtml(chart.title)}</div>`
    : '';

  const valeur = (v: number) =>
    escapeHtml(chart.prefix ?? '') +
    v.toFixed(decimals) +
    escapeHtml(chart.suffix ?? '');

  const style = chart.accentColor
    ? ` style="--chart-accent:${escapeHtml(chart.accentColor)}"`
    : '';

  const corps =
    kind === 'line'
      ? lineMarkup(chart, index, echelle)
      : `<div class="chart-bars">` +
        chart.points
          .map(
            (point, i) =>
              `<div class="chart-column">` +
              `<div class="chart-value" id="bv${index}-${i}">${valeur(point.value)}</div>` +
              // La piste porte la hauteur ; la barre n'en prend qu'une
              // fraction. Sans elle, le chiffre et l'étiquette mangeaient la
              // place et deux valeurs très différentes rendaient deux barres
              // presque égales.
              `<div class="chart-track">` +
              `<div class="chart-fill" id="b${index}-${i}"></div>` +
              '</div>' +
              `<div class="chart-label">${escapeHtml(point.label)}</div>` +
              '</div>'
          )
          .join('') +
        '</div>';

  return `<div class="chart chart-${escapeHtml(kind)}"${style}>${titre}${corps}</div>`;
}

/**
 * La courbe : le trait en SVG, les pastilles en HTML.
 *
 * Le SVG s'étire au cadre — `preserveAspectRatio="none"` — donc le même tracé
 * tient en 16:9 et en 9:16 sans qu'aucun calcul dépende du format. C'est
 * exactement ce qui interdit d'y mettre les pastilles : un `<circle>` étiré
 * devient une ellipse, et la première rendait une tache blanche large de trois
 * centimètres. Elles sont donc des éléments HTML posés en pourcentage, où
 * l'étirement du SVG ne les atteint pas.
 *
 * `vector-effect="non-scaling-stroke"` sur le trait, pour la même raison en
 * sens inverse : sans lui l'étirement déformerait son épaisseur.
 */
function lineMarkup(
  chart: NonNullable<HyperframesScene['chart']>,
  index: number,
  echelle: number
): string {
  const points = chartPoints(chart.points, echelle);

  const trace = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  const pastilles = points
    .map(
      (p, i) =>
        `<span class="chart-dot" id="ld${index}-${i}" ` +
        `style="left:${p.x.toFixed(2)}%;top:${p.y.toFixed(2)}%"></span>`
    )
    .join('');

  const etiquettes = chart.points
    .map((point) => `<div class="chart-label">${escapeHtml(point.label)}</div>`)
    .join('');

  return (
    '<div class="chart-plot">' +
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    `<polyline id="ln${index}" class="chart-line" points="${trace}" ` +
    'vector-effect="non-scaling-stroke" />' +
    '</svg>' +
    pastilles +
    '</div>' +
    `<div class="chart-axis">${etiquettes}</div>`
  );
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
