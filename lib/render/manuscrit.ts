import type { HyperframesScene } from '@/lib/storyboard/render';
import { escapeHtml } from './markup';

/**
 * La famille manuscrite : encadrés, entourages et enchaînements tracés à la
 * main par-dessus le plan.
 *
 * Elle est à part des nappes de `effets.ts` pour une raison de fond : celles-là
 * sont des décors sans contenu, celles-ci portent un **libellé**, une légende,
 * des nœuds nommés. Ce sont donc des tracés que le storyboard doit décrire, et
 * pas seulement poser.
 *
 * Deux contraintes gouvernent tout ce fichier.
 *
 * **Le tremblement est semé, jamais tiré au hasard.** Un `Math.random()` dans
 * la page donnerait un trait différent à chaque image, et le moteur cherche
 * chaque image : le trait grouillerait. La graine vient de l'indice de la
 * scène, donc le même storyboard rend le même trait, aujourd'hui et dans six
 * mois.
 *
 * **`pathLength="100"` sur chaque tracé.** C'est ce qui permet au dessin de se
 * faire par `stroke-dasharray`, en centièmes, sans que personne ait à mesurer
 * la longueur réelle — que l'étirement du SVG fausserait de toute façon.
 * Chrome ignore `pathLength` sur les formes (`rect`, `ellipse`), d'où des
 * `path` partout, même pour un rectangle.
 */

/**
 * Un générateur semé, court et suffisant.
 *
 * Le même que celui des jeux : on ne cherche pas du hasard de qualité, on
 * cherche un tremblement qui ne bouge pas d'un rendu à l'autre.
 */
function graine(depart: number) {
  let etat = depart * 2654435761 + 1;
  return () => {
    etat = (etat * 1103515245 + 12345) & 0x7fffffff;
    return etat / 0x7fffffff;
  };
}

/** Le tremblement d'un point, en unités du repère du tracé. */
const tremble = (tirage: () => number, ampleur: number) =>
  (tirage() - 0.5) * 2 * ampleur;

/**
 * Un rectangle arrondi tremblé.
 *
 * Écrit en `path` et non en `rect` : `pathLength` est ignoré sur les formes,
 * et sans lui le dessin progressif tomberait sur le vrai périmètre — donc sur
 * une valeur que le format de la vidéo change.
 */
function boite(tirage: () => number, boil: number, w: number, h: number): string {
  const r = Math.min(w, h) * 0.12;
  const p = (x: number, y: number) =>
    `${(x + tremble(tirage, boil)).toFixed(2)},${(y + tremble(tirage, boil)).toFixed(2)}`;
  return (
    `M ${p(r, 0)} L ${p(w - r, 0)} Q ${p(w, 0)} ${p(w, r)} ` +
    `L ${p(w, h - r)} Q ${p(w, h)} ${p(w - r, h)} ` +
    `L ${p(r, h)} Q ${p(0, h)} ${p(0, h - r)} ` +
    `L ${p(0, r)} Q ${p(0, 0)} ${p(r, 0)} Z`
  );
}

/** Une ellipse tremblée, en douze points : assez pour que la main se voie. */
function entourage(tirage: () => number, boil: number): string {
  const points = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const x = 50 + Math.cos(a) * (46 + tremble(tirage, boil * 2));
    const y = 50 + Math.sin(a) * (44 + tremble(tirage, boil * 2));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M ${points[0]} ` + points.slice(1).map((p) => `L ${p}`).join(' ') + ' Z';
}

/** Un gribouillis : deux traits obliques, pour meubler un coin de cadre. */
function gribouillis(tirage: () => number, boil: number, y: number): string {
  const points = Array.from({ length: 5 }, (_, i) => {
    const x = 8 + i * 21 + tremble(tirage, boil);
    return `${x.toFixed(2)},${(y + tremble(tirage, boil * 1.5)).toFixed(2)}`;
  });
  return `M ${points[0]} ` + points.slice(1).map((p) => `L ${p}`).join(' ');
}

const trace = (id: string, d: string) =>
  `<path id="${id}" d="${d}" pathLength="100" />`;

const encre = (color?: string) =>
  color ? ` style="--hw-ink:${escapeHtml(color)}"` : '';

/** Les tracés manuscrits d'une scène. */
export function manuscritMarkup(
  scene: HyperframesScene,
  index: number
): string {
  const effets = scene.effects;
  if (!effets) return '';
  const morceaux: string[] = [];

  const boite2 = effets.hwBoxLabel;
  if (boite2) {
    const tirage = graine(index + 1);
    const boil = boite2.boil ?? 1.4;
    const label = boite2.label
      ? `<div class="hw-label" id="hb${index}-l">${escapeHtml(boite2.label)}</div>`
      : '';
    morceaux.push(
      `<div class="hw-box" id="hb${index}"${encre(boite2.color)}>` +
        '<svg viewBox="0 0 100 62" preserveAspectRatio="none">' +
        trace(`hb${index}-0`, boite(tirage, boil, 100, 62)) +
        '</svg>' +
        label +
        '</div>'
    );
  }

  const rond = effets.hwCalloutCircle;
  if (rond) {
    const tirage = graine(index + 2);
    const taille = rond.size ?? 34;
    const label = rond.label
      ? `<div class="hw-label" id="hc${index}-l">${escapeHtml(rond.label)}</div>`
      : '';
    morceaux.push(
      `<div class="hw-callout" id="hc${index}"` +
        ` style="--hw-ink:${escapeHtml(rond.color ?? '#ffd9a0')};` +
        `left:${((rond.x ?? 50) - taille / 2).toFixed(2)}%;` +
        `top:${((rond.y ?? 50) - taille / 2).toFixed(2)}%;` +
        `width:${taille}%">` +
        '<svg viewBox="0 0 100 100">' +
        trace(`hc${index}-0`, entourage(tirage, rond.boil ?? 1.4)) +
        '</svg>' +
        label +
        '</div>'
    );
  }

  const cadre = effets.hwFrame;
  if (cadre) {
    const tirage = graine(index + 3);
    const boil = cadre.boil ?? 1.4;
    const legende = cadre.caption
      ? `<div class="hw-caption" id="hf${index}-l">${escapeHtml(cadre.caption)}</div>`
      : '';
    morceaux.push(
      `<div class="hw-frame" id="hf${index}"${encre(cadre.color)}>` +
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
        trace(`hf${index}-0`, boite(tirage, boil, 100, 100)) +
        trace(`hf${index}-1`, gribouillis(tirage, boil, 12)) +
        trace(`hf${index}-2`, gribouillis(tirage, boil, 90)) +
        '</svg>' +
        legende +
        '</div>'
    );
  }

  const chaine = effets.hwPipeline;
  if (chaine) {
    const tirage = graine(index + 4);
    const noeuds = chaine.nodes
      .map(
        (nom: string, k: number) =>
          `<div class="hw-node" id="hp${index}-n${k}">` +
          `<div class="hw-label" id="hp${index}-l${k}">${escapeHtml(nom)}</div>` +
          '</div>'
      )
      .join('');
    // Une liaison de moins que de nœuds : elles vivent entre eux.
    const liaisons = chaine.nodes
      .slice(1)
      .map((_: string, k: number) => {
        const y = 50 + tremble(tirage, 6);
        return (
          `<svg class="hw-link" viewBox="0 0 100 100" preserveAspectRatio="none">` +
          trace(
            `hp${index}-c${k}`,
            `M 0,50 Q 50,${y.toFixed(2)} 100,50`
          ) +
          '</svg>'
        );
      })
      .join('');
    morceaux.push(
      `<div class="hw-pipe" id="hp${index}"${encre(chaine.color)}>` +
        noeuds +
        liaisons +
        '</div>'
    );
  }

  return morceaux.join('');
}
