import type { HyperframesScene } from '@/lib/storyboard/render';

/**
 * Les instants des plans dont le contenu est une donnée.
 *
 * Séparés de `plan.ts` pour la même raison que `structures.ts` l'est de
 * `markup.ts` : ce fichier-là minute la scène, celui-ci minute ce qu'elle
 * raconte. Et parce que `plan.ts` touchait les sept cents lignes.
 *
 * La règle de tout le fichier : **rien ne se calcule dans le navigateur**. Le
 * moteur cherche chaque image ; un calcul fait dans la page dériverait d'un
 * rendu à l'autre. Fractions, points projetés, longueurs de tracé et instants
 * absolus arrivent tout faits.
 */

/** Trois millisecondes de précision : au-delà, le rendu ne distingue plus. */
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * Tout ce qu'un plan structuré envoie à la page, pour une scène.
 *
 * Étalé dans l'objet de scène par `buildTimeline`. Regroupé ici parce que ces
 * champs partagent une seule règle — bornés par la fin de la scène, calculés
 * hors du navigateur — et parce qu'ils sont la partie du moteur qui grandit le
 * plus vite.
 */
/**
 * Les instants des tracés manuscrits.
 *
 * Chacun se dessine en `stroke-dasharray`, en centièmes grâce à `pathLength` —
 * la page n'a donc aucune longueur à mesurer, et l'étirement du SVG ne peut
 * pas la fausser. Ne reste ici que le quand.
 */
export function manuscritTimeline(scene: HyperframesScene) {
  const effets = scene.effects as Record<string, Record<string, unknown>> | undefined;
  if (!effets) return {};

  const sortie: Record<string, unknown> = {};
  for (const nom of ['hwBoxLabel', 'hwCalloutCircle', 'hwFrame', 'hwPipeline']) {
    const pose = effets[nom];
    if (!pose) continue;
    const depart =
      scene.startInSeconds + ((pose.startInSeconds as number | undefined) ?? 0.4);
    const reste = Math.max(
      0.2,
      scene.startInSeconds + scene.durationInSeconds - depart
    );
    sortie[nom] = {
      at: ms(depart),
      duration: Math.min(
        (pose.durationInSeconds as number | undefined) ?? 0.9,
        reste
      ),
      // Le nombre de tracés à dessiner : le tween en tire son décalage.
      traces:
        nom === 'hwFrame'
          ? 3
          : nom === 'hwPipeline'
            ? Math.max(0, ((pose.nodes as string[] | undefined)?.length ?? 2) - 1)
            : 1,
    };
  }
  return sortie;
}

export function structuredPlans(scene: HyperframesScene) {
  const tiers = scene.lowerThird;
  const chart = scene.chart;
  const thread = scene.thread;
  const quote = scene.quote;
  const list = scene.list;
  const face = scene.comparison;
  const social = scene.socialCard;
  const cta = scene.callToAction;

  return {
  lowerThird: tiers
    ? (() => {
        const at = scene.startInSeconds + (tiers.startInSeconds ?? 0);
        const fin = scene.startInSeconds + scene.durationInSeconds;
        return {
          at: ms(at),
          out: ms(Math.min(at + (tiers.holdSeconds ?? 3), fin)),
          // Un tiers à droite entre par la droite : le geste vient du
          // bord dont il est le plus proche, sinon il traverse l'image.
          dx: tiers.side === 'right' ? 40 : -40,
        };
      })()
    : null,
  counter: scene.counter
    ? {
        at: ms(scene.startInSeconds + (scene.counter.startInSeconds ?? 0)),
        duration: scene.counter.durationInSeconds ?? 1.4,
        from: scene.counter.from ?? 0,
        to: scene.counter.value,
        decimals: scene.counter.decimals ?? 0,
        prefix: scene.counter.prefix ?? '',
        suffix: scene.counter.suffix ?? '',
        ring: scene.counter.variant === 'ring',
        /*
         * La roue : un rang par chiffre de la valeur d'arrivée, et le
         * déplacement de sa bande en pourcentage.
         *
         * Calculé ici et pas dans la page pour la raison habituelle, plus une
         * autre : le nombre de rangs vient de la valeur d'arrivée, pas de la
         * valeur courante. Une roue qui gagnerait une colonne en route
         * sauterait à chaque dizaine franchie.
         */
        wheel:
          scene.counter.variant === 'wheel'
            ? Math.abs(Math.round(scene.counter.value))
                .toString()
                .split('')
                .map((chiffre) => ({ to: -Number(chiffre) * 10 }))
            : null,
      }
    : null,
  /*
   * Le graphique, réduit à des nombres.
   *
   * Toute la géométrie est faite ici : la page ne reçoit que des
   * fractions et, pour la courbe, la longueur de son propre tracé. Un
   * calcul fait dans le navigateur dériverait d'un rendu à l'autre, et
   * `getTotalLength()` sur un SVG étiré ne rend pas la même valeur selon
   * le format — d'où la longueur mesurée ici, dans le carré de 100.
   *
   * Le décalage entre les barres est borné : six barres à 0,12 s
   * mettraient 0,6 s à démarrer, et la dernière n'aurait plus le temps
   * de monter avant la fin de la scène.
   */
  chart: chart
    ? (() => {
        const echelle =
          chart.max ?? Math.max(...chart.points.map((p) => p.value));
        const at = scene.startInSeconds + (chart.startInSeconds ?? 0);
        const duree = chart.durationInSeconds ?? 0.9;
        const stagger = Math.min(0.12, 0.5 / chart.points.length);

        const projete = chartPoints(chart.points, echelle);

        return {
          at: ms(at),
          duration: duree,
          stagger,
          prefix: chart.prefix ?? '',
          suffix: chart.suffix ?? '',
          decimals: chart.decimals ?? 0,
          /*
           * Aucune barre pour une courbe.
           *
           * Les émettre quand même visait des `#b<n>` qui n'existent pas, et
           * GSAP le signalait à chaque rendu. Une garde qui crie pour rien
           * finit par ne plus être lue.
           */
          bars:
            (chart.kind ?? 'bar') === 'bar'
              ? chart.points.map((point) => ({
                  value: point.value,
                  part: echelle > 0 ? point.value / echelle : 0,
                }))
              : [],
          line:
            (chart.kind ?? 'bar') === 'line'
              ? {
                  // Chaque pastille s'allume quand le trait l'atteint :
                  // la courbe se dessine, les points la ponctuent.
                  dots: projete.map((_, i) => ({
                    at: ms((i / (projete.length - 1)) * duree * 1.6),
                  })),
                }
              : null,
        };
      })()
    : null,
  /*
   * Le fil : un instant par message, en cascade.
   *
   * Le pas est borné par ce qui reste de la scène. Cinq messages à une
   * seconde d'écart tiennent cinq secondes ; sur un plan de trois, les
   * deux derniers n'apparaîtraient jamais et le storyboard mentirait sur
   * ce qu'il montre.
   */
  thread: thread
    ? (() => {
        const debut =
          scene.startInSeconds + (thread.startInSeconds ?? 0);
        const reste = Math.max(
          0.3,
          scene.startInSeconds + scene.durationInSeconds - debut - 0.4
        );
        const pas = Math.min(
          thread.stepSeconds ?? 0.7,
          reste / Math.max(1, thread.messages.length - 1)
        );
        return {
          at: ms(debut),
          messages: thread.messages.map((_, i) => ({
            at: ms(debut + i * pas),
          })),
        };
      })()
    : null,
  /*
   * La citation : la phrase d'abord, la signature après.
   *
   * Le nom arrive une fois la phrase lisible. L'ordre est le sens même
   * du plan — on cite, puis on dit qui.
   */
  quote: quote
    ? (() => {
        const at = scene.startInSeconds + (quote.startInSeconds ?? 0);
        const duree = quote.durationInSeconds ?? 0.6;
        return { at: ms(at), duration: duree, sign: ms(at + duree * 0.8) };
      })()
    : null,
    /*
     * La liste et la comparaison partagent la même arithmétique : un pas borné
     * par ce qui reste de la scène, pour que la dernière ligne ait encore le
     * temps d'arriver.
     */
    list: list
      ? cascade(scene, list.startInSeconds, list.stepSeconds, list.items.length)
      : null,
    /*
     * La carte de réseau social entre et **sort**, comme le tiers inférieur :
     * elle commente un moment du plan, elle ne l'habille pas du début à la fin.
     * Sa sortie est bornée par la fin de la scène — une carte qui lui
     * survivrait se poserait sur le plan suivant, qui n'en a pas voulu.
     */
    socialCard: social
      ? (() => {
          const at = scene.startInSeconds + (social.startInSeconds ?? 0);
          const fin = scene.startInSeconds + scene.durationInSeconds;
          return {
            at: ms(at),
            out: ms(Math.min(at + (social.holdSeconds ?? 3.5), fin)),
            dx: social.side === 'right' ? 40 : -40,
          };
        })()
      : null,
    /*
     * La carte de clôture : la phrase, puis le bouton un temps après.
     *
     * Le bouton arrive en dernier et c'est tout le sujet — on lit la promesse
     * avant de voir ce qu'on demande. L'écart est borné par ce qui reste de la
     * scène, sinon sur un plan court le bouton n'apparaîtrait jamais.
     */
    callToAction: cta
      ? (() => {
          const at = scene.startInSeconds + (cta.startInSeconds ?? 0);
          const reste = Math.max(
            0.2,
            scene.startInSeconds + scene.durationInSeconds - at - 0.3
          );
          return { at: ms(at), button: ms(at + Math.min(0.75, reste)) };
        })()
      : null,
    // Les deux colonnes avancent ensemble : le rang commande, pas le côté.
    comparison: face
      ? cascade(
          scene,
          face.startInSeconds,
          face.stepSeconds,
          Math.max(face.left.items.length, face.right.items.length)
        )
      : null,
  };
}

/**
 * Une cascade d'instants absolus, bornée par la fin de la scène.
 *
 * Trois plans structurés en ont besoin — le fil, la liste, la comparaison — et
 * ils avaient tous le même piège : cinq lignes à une seconde d'écart ne
 * tiennent pas dans un plan de trois secondes, et les deux dernières
 * n'arriveraient jamais. Le pas se resserre plutôt que de déborder.
 *
 * La marge de 0,4 s en fin de scène laisse à la dernière ligne le temps de
 * finir son entrée, pas seulement de la commencer.
 */
function cascade(
  scene: { startInSeconds: number; durationInSeconds: number },
  depart: number | undefined,
  pasVoulu: number | undefined,
  combien: number
): { at: number; steps: { at: number }[] } {
  const debut = scene.startInSeconds + (depart ?? 0);
  const reste = Math.max(
    0.3,
    scene.startInSeconds + scene.durationInSeconds - debut - 0.4
  );
  const pas = Math.min(pasVoulu ?? 0.5, reste / Math.max(1, combien - 1));
  return {
    at: ms(debut),
    steps: Array.from({ length: combien }, (_, i) => ({
      at: ms(debut + i * pas),
    })),
  };
}

/**
 * Où tombe chaque point, en pourcentage du cadre du tracé.
 *
 * Exportée parce que le balisage et la timeline ont besoin des **mêmes**
 * coordonnées : le SVG dessine la ligne, les pastilles sont des éléments HTML
 * posés dessus. Deux projections séparées dériveraient l'une de l'autre au
 * premier changement d'échelle.
 *
 * La série n'occupe que 10 à 90 % de la hauteur. Sans cette marge, la valeur
 * la plus haute touche le bord du cadre et la courbe paraît coupée.
 *
 * En largeur, un point tombe au **centre de sa colonne** — `(i + 0,5) / n` —
 * et non aux deux bords du cadre. L'axe range ses libellés en colonnes égales
 * (`flex: 1 1 0`) : étaler la série de 0 à 100 % mettait le premier point au
 * bord gauche du tracé pendant que son libellé restait au sixième, et aucun
 * point ne surplombait son nom. Le premier rendu complet du 3 septembre 2026
 * l'a montré ; la garde ne pouvait pas, elle ne compare qu'à elle-même.
 */
export function chartPoints(
  points: { value: number }[],
  echelle: number
): { x: number; y: number }[] {
  return points.map((point, i) => ({
    x: ((i + 0.5) / Math.max(1, points.length)) * 100,
    y: 90 - (echelle > 0 ? (point.value / echelle) * 80 : 0),
  }));
}


