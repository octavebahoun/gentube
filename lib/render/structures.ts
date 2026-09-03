import type { HyperframesScene } from '@/lib/storyboard/render';
import { chartPoints } from './plan';
import { escapeHtml } from './markup';

/**
 * Le balisage des plans dont le contenu est une donnée : tiers inférieur,
 * graphique, compteur.
 *
 * Séparé de `markup.ts` pour la même raison que `contenus.ts` l'est de
 * `animations.ts` — celui-là habille la scène, celui-ci dessine ce qu'elle
 * raconte. Et parce qu'un fichier qui dépasse six cents lignes ne se relit
 * plus.
 *
 * La règle qui gouverne tout ce fichier : **un élément par information**. Le
 * CSS ne peut hiérarchiser que ce qui lui arrive séparé, et c'est toute la
 * raison d'être du palier 3.
 */

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
 * Le fil de discussion : une bulle par réplique, et deux côtés.
 *
 * L'auteur et le texte sont deux éléments, comme le nom et la fonction du
 * tiers inférieur : c'est la feuille de style qui décide lequel domine, et
 * elle ne peut le faire que sur ce qui lui arrive séparé.
 *
 * Le côté est une classe et non un style en ligne, parce qu'il change trois
 * choses d'un coup — l'alignement, la couleur du fond, l'arrondi du coin qui
 * pointe vers celui qui parle.
 */
export function threadMarkup(
  scene: HyperframesScene,
  index: number
): string {
  const thread = scene.thread;
  if (!thread) return '';

  const style = thread.accentColor
    ? ` style="--thread-accent:${escapeHtml(thread.accentColor)}"`
    : '';

  const titre = thread.title
    ? `<div class="thread-title">${escapeHtml(thread.title)}</div>`
    : '';

  const bulles = thread.messages
    .map(
      (message, i) =>
        `<div class="thread-row thread-${message.mine ? 'mine' : 'theirs'}" ` +
        `id="th${index}-${i}">` +
        `<div class="thread-from">${escapeHtml(message.from)}</div>` +
        `<div class="thread-bubble">${escapeHtml(message.text)}</div>` +
        '</div>'
    )
    .join('');

  return (
    `<div class="thread"${style}>${titre}` +
    `<div class="thread-rows">${bulles}</div>` +
    '</div>'
  );
}
