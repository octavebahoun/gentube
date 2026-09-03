import type { HyperframesScene } from '@/lib/storyboard/render';
import { EFFETS } from '@/lib/storyboard/effets';
import { escapeHtml } from './markup';

/**
 * Le balisage et les instants des nappes d'effet, lus dans `effets.ts`.
 *
 * Un effet déclaré là-bas n'a rien à écrire ici : son div, ses variables CSS
 * et son instant se déduisent de sa fiche. C'est ce qui permet d'en ajouter un
 * en une ligne au lieu de quatre éditions dans quatre fichiers.
 *
 * Ce que ce fichier ne fait pas : le tween. Il vit dans `animations.ts`, qui
 * appartient au palier 2 — chacun son côté de la frontière.
 */

const ms = (secondes: number) => Math.round(secondes * 1000) / 1000;

/**
 * Les nappes d'une scène, en HTML.
 *
 * `fond` sépare les deux endroits où elles peuvent aller : sous le média pour
 * un décor, au-dessus pour tout le reste. Une grille posée par-dessus une
 * photo ne serait plus un fond, ce serait un calque.
 */
export function effetsMarkup(
  scene: HyperframesScene,
  index: number,
  fond: boolean
): string {
  const effets = scene.effects as Record<string, Record<string, unknown>> | undefined;
  if (!effets) return '';

  return Object.entries(EFFETS)
    .filter(([nom, effet]) => Boolean(effet.fond) === fond && effets[nom])
    .map(([nom, effet]) => {
      const pose = effets[nom];
      const style = Object.entries(effet.reglages)
        .filter(([, reglage]) => reglage.css)
        .map(([cle, reglage]) => {
          const valeur = pose[cle] ?? reglage.defaut;
          // `left` et `top` sont des pourcents ; les variables, des nombres
          // nus que la feuille de style habille.
          const unite = reglage.css === 'left' || reglage.css === 'top' ? '%' : '';
          return `${reglage.css}:${escapeHtml(String(valeur))}${unite}`;
        })
        .join(';');

      return (
        `<div class="${effet.classe}" id="${effet.id}${index}"` +
        (style ? ` style="${style}"` : '') +
        `></div>`
      );
    })
    .join('');
}

/**
 * Les instants des nappes, pour la page.
 *
 * `etat` n'en produit aucun : il n'y a rien à minuter, l'effet est là ou il
 * n'est pas. `ambiance` est borné par la fin de la scène — une nappe qui lui
 * survivrait se poserait sur le plan suivant, qui n'en a pas voulu.
 */
export function effetsTimeline(
  scene: HyperframesScene,
  surLeTemps: (instant: number) => number
): Record<string, unknown> {
  const effets = scene.effects as Record<string, Record<string, unknown>> | undefined;
  if (!effets) return {};

  const sortie: Record<string, unknown> = {};
  for (const [nom, effet] of Object.entries(EFFETS)) {
    const pose = effets[nom];
    if (!pose || effet.minutage === 'etat') continue;

    const depart =
      scene.startInSeconds +
      ((pose.startInSeconds as number | undefined) ?? effet.depart ?? 0);
    const reste = Math.max(
      0.05,
      scene.startInSeconds + scene.durationInSeconds - depart
    );
    const voulue = (pose.durationInSeconds as number | undefined) ?? effet.duree;

    const donnees: Record<string, unknown> = {
      at: effet.surLeTemps ? surLeTemps(depart) : ms(depart),
      duration:
        effet.minutage === 'ambiance'
          ? Math.min(voulue ?? reste, reste)
          : (voulue ?? 0.6),
    };
    for (const [cle, reglage] of Object.entries(effet.reglages)) {
      donnees[cle] = pose[cle] ?? reglage.defaut;
    }
    sortie[nom] = donnees;
  }
  return sortie;
}
