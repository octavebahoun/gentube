import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  MOVE_TRANSITIONS,
  sceneRenderSchema,
  toHyperframesStoryboard,
} from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { SUBTITLE_STYLES } from '@/lib/videos';
import { listSchema, lowerThirdSchema } from '@/lib/storyboard/plans';
import { EFFETS, type Effet } from '@/lib/storyboard/effets';
import {
  MOMENTS,
  momentDeLaCoupe,
  DEPART_DU_GRAPHIQUE,
  momentDeLaCascade,
  momentDeLaRoue,
  momentDeLaCitation,
  momentDuFil,
  momentDuGraphique,
  momentDeLaNappe,
  momentDuTiers,
  momentDuTitre,
  REFERENCE_VIDEO,
  REFERENCE_VIDEO_VERTICALE,
  referenceShots,
} from './fixtures';

/**
 * La régression visuelle du moteur.
 *
 *   npx tsx render/regression/run.ts             # compare aux références
 *   npx tsx render/regression/run.ts --update    # les réécrit
 *
 * Ce que les tests unitaires ne peuvent pas dire : à quoi la vidéo ressemble.
 * Ils vérifient qu'un tween est déclaré au bon instant ; ils ne voient pas
 * qu'une règle CSS l'a rendu invisible. Toutes les erreurs de la nuit — la
 * bande noire des poussées, l'anneau collé en haut à gauche — sont passées à
 * travers une suite verte.
 *
 * Le rendu est forcé en **SwiftShader**. Un GPU matériel ne donne pas deux
 * fois le même pixel d'une machine à l'autre : la référence deviendrait un
 * piège plutôt qu'un garde-fou.
 */

const HERE = resolve('render/regression');
const REFERENCES = join(HERE, 'references');
const ECART_TOLERE = 0.995; // SSIM ; en dessous, l'image a visiblement changé.

const update = process.argv.includes('--update');
/** Garde les projets rendus au lieu de les effacer : pour inspecter la page. */
const garder = process.argv.includes('--garder');

/**
 * Les deux formats vendus. Le vertical n'a longtemps existé que dans l'enum ;
 * il est ici pour qu'une régression dans un cadre étroit se voie aussi.
 */
const FORMATS = [
  { nom: '16-9', video: REFERENCE_VIDEO },
  { nom: '9-16', video: REFERENCE_VIDEO_VERTICALE },
] as const;

/**
 * Un format supplémentaire par style de sous-titre, activé à la demande.
 *
 *   pnpm tsx render/regression/run.ts --styles
 *
 * Hors du jeu par défaut : neuf styles font neuf rendus, et la garde doit
 * rester assez rapide pour être lancée à chaque changement.
 */
/*
 * Toutes les variantes déclarées, lues dans le contrat.
 *
 * La liste était écrite à la main et s'était arrêtée à vingt-sept sur
 * cinquante-cinq : les vingt-huit autres n'avaient aucune référence, donc
 * aucune garde. Lue dans l'énumération, une variante de plus est une image de
 * plus — et il n'est plus possible d'en ajouter une sans la regarder.
 */
const TITRES = sceneRenderSchema.shape.kineticTitle
  .unwrap()
  .shape.variant.unwrap()
  .options.map((variant) => ({
  nom: `titre-${variant}`,
  video: REFERENCE_VIDEO,
  variant,
  // Une seule capture, au milieu de l'animation. Les six autres instants ne
  // diraient que ce que les formats disent déjà — et le septième, pris après
  // la fin du geste, rendait les vingt-sept variantes identiques.
  moments: [momentDuTitre(variant)],
}));

const STYLES = SUBTITLE_STYLES.map((style) => ({
  nom: `style-${style}`,
  video: { ...REFERENCE_VIDEO, subtitleStyle: style } as typeof REFERENCE_VIDEO,
}));

type Jeu = {
  nom: string;
  video: typeof REFERENCE_VIDEO;
  variant?: string;
  transition?: string;
  /** Variante de tiers inférieur posée sur la deuxième scène. */
  lowerThird?: string;
  /** Type de graphique posé à la place du compteur, cinquième scène. */
  chart?: string;
  /** Pose un fil de discussion à la place du compteur, cinquième scène. */
  thread?: boolean;
  /** Pose une citation à la place du compteur, cinquième scène. */
  quote?: boolean;
  /** Pose une liste ou une comparaison, cinquième scène. */
  cascade?: 'list' | 'comparison';
  /** Variante de compteur posée sur la cinquième scène. */
  counter?: string;
  /** Nappe d'effet posée sur la deuxième scène — ou la cinquième si c'est un fond. */
  nappe?: string;
  /** Disposition posée sur la liste, quand `cascade` vaut `list`. */
  listLayout?: string;
  /** Restreint la capture : par défaut, tous les instants. */
  moments?: typeof MOMENTS;
};

/**
 * Un jeu par transition par déplacement, activé par --transitions.
 *
 * Une seule capture chacun, au milieu de sa coupe — et l'instant se recalcule
 * pour chaque geste, puisque sa durée décale le début de la scène qui arrive.
 * Les six autres instants ne diraient que ce que les formats disent déjà, pour
 * vingt-trois rendus de plus.
 */
const COUPES: Jeu[] = MOVE_TRANSITIONS.map((kind) => ({
  nom: `coupe-${kind}`,
  video: REFERENCE_VIDEO,
  transition: kind,
  moments: [momentDeLaCoupe(kind)],
}));

/**
 * Un jeu par variante de tiers inférieur, activé par --tiers.
 *
 * Posé sur la deuxième scène, celle qui a une image et rien d'autre : un
 * bandeau se juge sur ce qu'il recouvre. Une seule capture chacun — les six
 * autres instants ne montreraient que ce que les formats disent déjà.
 */
/* Les variantes posées à droite, pour que les deux côtés soient couverts. */
const SIDE_DROIT = new Set(['boxed', 'soft-pill', 'kicker-name', 'stack-bars']);

const TIERS: Jeu[] = lowerThirdSchema.shape.variant
  .unwrap()
  .options.map((variant) => ({
    nom: `tiers-${variant}`,
    video: REFERENCE_VIDEO,
    lowerThird: variant,
    moments: [momentDuTiers()],
  }));

/**
 * Un jeu par type de graphique, activé par --graphiques.
 *
 * Posé sur la cinquième scène, celle qui n'a pas d'image : un plan chiffré se
 * dessine seul, et le graphique y remplace le compteur plutôt que de se
 * superposer à lui.
 */
const GRAPHIQUES: Jeu[] = ['bar', 'line'].map((kind) => ({
  nom: `graphique-${kind}`,
  video: REFERENCE_VIDEO,
  chart: kind,
  moments: [momentDuGraphique(kind)],
}));

/**
 * Le fil de discussion, activé par --fils.
 *
 * Sur la cinquième scène comme le graphique : un plan qui se dessine seul n'a
 * pas d'image à recouvrir, et le compteur lui cède la place.
 */
const FILS: Jeu[] = [
  {
    nom: 'fil',
    video: REFERENCE_VIDEO,
    thread: true,
    moments: [momentDuFil()],
  },
];

const CITATIONS: Jeu[] = [
  {
    nom: 'citation',
    video: REFERENCE_VIDEO,
    quote: true,
    moments: [momentDeLaCitation()],
  },
];

/**
 * La liste et la comparaison, activées par --cascades.
 *
 * Quatre lignes chacune : assez pour que le décalage se voie, assez peu pour
 * qu'elles tiennent dans un plan de trois secondes.
 */
const CASCADES: Jeu[] = [
  ...(['list', 'comparison'] as const).map((quoi) => ({
    nom: quoi === 'list' ? 'liste' : 'comparaison',
    video: REFERENCE_VIDEO,
    cascade: quoi as 'list' | 'comparison',
    moments: [momentDeLaCascade(4)],
  })),
  /*
   * Et une image par disposition, lue dans le schéma. Même règle que pour les
   * variantes de titre et de tiers inférieur : ce qui est écrit à la main
   * s'arrête, et personne ne le voit.
   */
  ...listSchema.shape.layout
    .unwrap()
    .options.map((layout) => ({
      nom: `liste-${layout}`,
      video: REFERENCE_VIDEO,
      cascade: 'list' as const,
      listLayout: layout,
      moments: [momentDeLaCascade(4)],
    })),
];

/**
 * La roue du compteur, activée par --roue.
 *
 * Capturée à mi-course : à la fin les chiffres sont posés et l'image ne dirait
 * pas si la roue a tourné.
 */
const ROUE: Jeu[] = [
  {
    nom: 'roue',
    video: REFERENCE_VIDEO,
    counter: 'wheel',
    // Au milieu de la course, pas à la fin : une roue arrêtée ne dit pas
    // qu'elle a tourné, et c'est tout ce que cette variante ajoute.
    moments: [momentDeLaRoue()],
  },
];

/**
 * Une nappe par fiche de la table, activé par --nappes.
 *
 * Le jeu se lit dans `EFFETS` et non dans une liste écrite à la main : c'est ce
 * qui fait qu'on ne peut plus ajouter une nappe sans la regarder. Les listes
 * écrites à la main se sont arrêtées deux fois — 27 variantes de titre sur 65,
 * 3 tiers inférieurs sur 13 — et personne ne l'avait vu.
 *
 * Un fond va sur la cinquième scène, qui n'a pas d'image : posé sous le média,
 * il serait entièrement recouvert et la référence serait un carré noir.
 */
const NAPPES: Jeu[] = Object.entries(EFFETS).map(([nom, effet]) => ({
  nom: `nappe-${nom}`,
  video: REFERENCE_VIDEO,
  nappe: nom,
  moments: [momentDeLaNappe(effet)],
}));

/** Un projet jetable : le vrai style et le vrai vendor, des médias figés. */
function projet(jeu: Jeu): string {
  const {
    video,
    variant,
    transition,
    lowerThird,
    chart,
    thread,
    quote,
    cascade,
    counter,
    nappe,
    listLayout,
  } = jeu;
  const dir = mkdtempSync(join(tmpdir(), 'gentube-regression-'));
  for (const part of ['style.css', 'hyperframes.json', 'vendor']) {
    cpSync(join(COMPOSITION_DIR, part), join(dir, part), { recursive: true });
  }
  cpSync(join(HERE, 'media'), join(dir, 'media'), { recursive: true });
  cpSync(join(HERE, 'voice'), join(dir, 'voice'), { recursive: true });

  const shots = referenceShots();
  if (variant) {
    // La scène d'ouverture porte le titre : c'est elle qu'on décline.
    const render = shots[0].render as { kineticTitle?: { variant?: string } };
    if (render.kineticTitle) render.kineticTitle.variant = variant;
  }
  if (transition) {
    // La troisième scène est celle dont la coupe est capturée.
    const effects = (shots[2].render as { effects?: { transition?: string } }).effects;
    if (effects) effects.transition = transition;
  }
  if (lowerThird) {
    // La deuxième scène : une image, et rien qui dispute la place au bandeau.
    (shots[1].render as Record<string, unknown>).lowerThird = {
      name: 'Kofi Mensah',
      role: 'agronome, Cotonou',
      variant: lowerThird,
      side: SIDE_DROIT.has(lowerThird) ? 'right' : 'left',
    };
  }
  if (nappe) {
    // Un fond se pose sur la scène sans image ; tout le reste sur la deuxième,
    // qui a une image et rien qui lui dispute la place.
    const scene = EFFETS[nappe].fond ? 4 : 1;
    const render = shots[scene].render as Record<string, unknown>;
    if (scene === 4) delete render.counter;
    render.effects = { ...(render.effects as object), [nappe]: {} };
  }
  if (chart) {
    // La cinquième scène porte le compteur : on la reprend pour le graphique,
    // parce qu'elle est déjà sans image et sans voix à illustrer.
    const render = shots[4].render as Record<string, unknown>;
    delete render.counter;
    render.chart = {
      kind: chart,
      title: 'Trois villes, trois volumes',
      points: [
        { label: 'Cotonou', value: 40 },
        { label: 'Porto-Novo', value: 25 },
        { label: 'Parakou', value: 10 },
      ],
      suffix: ' %',
      startInSeconds: DEPART_DU_GRAPHIQUE,
    };
  }

  if (thread) {
    const render = shots[4].render as Record<string, unknown>;
    delete render.counter;
    render.thread = {
      title: 'Groupe cooperative',
      startInSeconds: DEPART_DU_GRAPHIQUE,
      messages: [
        { from: 'Awa', text: 'Tu as vu les chiffres du mois ?' },
        { from: 'Moi', text: 'Trois fois plus qu en juin.', mine: true },
        { from: 'Awa', text: 'On garde le meme rythme.', typing: true },
      ],
    };
  }

  if (quote) {
    const render = shots[4].render as Record<string, unknown>;
    delete render.counter;
    render.quote = {
      text: 'La terre ne ment jamais sur ce qu on lui a donne',
      author: 'Kofi Mensah',
      role: 'agronome, Cotonou',
      startInSeconds: DEPART_DU_GRAPHIQUE,
    };
  }

  if (cascade) {
    const render = shots[4].render as Record<string, unknown>;
    delete render.counter;
    if (cascade === 'list') {
      render.list = {
        title: 'Quatre chiffres du mois',
        // L'étiquette n'a de sens qu'au bandeau, mais elle est posée partout :
        // une disposition qui la mettrait au mauvais endroit se verrait.
        label: listLayout ? 'DIRECT' : undefined,
        layout: listLayout,
        ordered: true,
        startInSeconds: DEPART_DU_GRAPHIQUE,
        items: [
          { text: 'Adhesions nouvelles', value: '412' },
          { text: 'Sacs collectes', value: '6 000' },
          { text: 'Villages couverts', value: '17' },
          { text: 'Delai moyen', value: '2 j' },
        ],
      };
    } else {
      render.comparison = {
        title: 'Avant et apres la cooperative',
        startInSeconds: DEPART_DU_GRAPHIQUE,
        left: {
          label: 'Avant',
          items: ['Vente au bord de route', 'Prix subi', 'Aucun stock'],
        },
        right: {
          label: 'Apres',
          items: ['Vente groupee', 'Prix negocie', 'Magasin commun', 'Avance'],
        },
      };
    }
  }

  if (counter) {
    const render = shots[4].render as { counter?: { variant?: string } };
    if (render.counter) render.counter.variant = counter;
  }

  const storyboard = toHyperframesStoryboard(video, shots);
  writeFileSync(join(dir, 'index.html'), composeHtml({ storyboard, watermark: true }));
  return dir;
}

function capture(dir: string, moments: typeof MOMENTS): string {
  const sortie = join(dir, 'captures');
  execFileSync(
    'npx',
    [
      'hyperframes', 'snapshot', dir,
      '--at', moments.map((m) => m.at).join(','),
      '--no-end', '--describe', 'false', '--no-browser-gpu',
      '-o', sortie,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'], timeout: 600_000 }
  );
  return sortie;
}

/**
 * La similarité de deux images, entre 0 et 1.
 *
 * SSIM plutôt qu'une égalité au pixel : l'antialiasing du texte varie d'une
 * version de Chrome à l'autre, et un test qui casse à chaque mise à jour finit
 * par être désactivé.
 */
function similarite(a: string, b: string): number {
  // ffmpeg écrit ses mesures sur stderr, pas sur stdout. Lire le mauvais flux
  // donne une chaîne vide et une erreur qui accuse le fichier plutôt que soi.
  const { stderr } = spawnSync(
    'ffmpeg',
    ['-loglevel', 'info', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-'],
    { encoding: 'utf8' }
  );
  const trouve = /All:([0-9.]+)/.exec(stderr ?? '');
  if (!trouve) {
    throw new Error(`ffmpeg n'a pas rendu de SSIM :\n${(stderr ?? '').slice(-400)}`);
  }
  return Number(trouve[1]);
}

function main() {
  let echecs = 0;

  let jeux: Jeu[] = [...FORMATS];
  if (process.argv.includes('--styles')) jeux = [...jeux, ...STYLES];
  if (process.argv.includes('--titres')) jeux = [...jeux, ...TITRES];
  if (process.argv.includes('--transitions')) jeux = [...jeux, ...COUPES];
  if (process.argv.includes('--tiers')) jeux = [...jeux, ...TIERS];
  if (process.argv.includes('--graphiques')) jeux = [...jeux, ...GRAPHIQUES];
  if (process.argv.includes('--fils')) jeux = [...jeux, ...FILS];
  if (process.argv.includes('--citations')) jeux = [...jeux, ...CITATIONS];
  if (process.argv.includes('--cascades')) jeux = [...jeux, ...CASCADES];
  if (process.argv.includes('--roue')) jeux = [...jeux, ...ROUE];
  if (process.argv.includes('--nappes')) jeux = [...jeux, ...NAPPES];

  for (const jeu of jeux) {
    console.log(`\n${jeu.nom} · ${jeu.video.resolution}`);
    echecs += passer(jeu);
  }

  if (echecs > 0) {
    console.error(
      `\n${echecs} instant(s) ont changé. Regardez les captures gardées : si le ` +
        'changement est voulu, relancez avec --update.'
    );
    process.exit(1);
  }
  const total = jeux.reduce((n, jeu) => n + (jeu.moments ?? MOMENTS).length, 0);
  console.log(`\n${total} instants conformes.`);
}

/** Un format : on assemble, on capture, on compare, on nettoie. */
function passer(jeu: Jeu): number {
  const nom = jeu.nom;
  const moments = jeu.moments ?? MOMENTS;
  const dir = projet(jeu);
  let echecs = 0;

  try {
    const captures = capture(dir, moments);
    const fichiers = readdirSync(captures)
      .filter((f) => f.endsWith('.png'))
      .sort();

    if (fichiers.length !== moments.length) {
      throw new Error(
        `${fichiers.length} captures pour ${moments.length} instants attendus.`
      );
    }

    mkdirSync(REFERENCES, { recursive: true });

    for (const [index, moment] of moments.entries()) {
      const prise = join(captures, fichiers[index]);
      const etiquette = `${nom}-${moment.nom}`;
      const reference = join(REFERENCES, `${etiquette}.png`);

      if (update || !existsSync(reference)) {
        cpSync(prise, reference);
        console.log(`  référence écrite   ${etiquette}`);
        continue;
      }

      const score = similarite(reference, prise);
      if (score >= ECART_TOLERE) {
        console.log(`  ✓ ${etiquette.padEnd(26)} ${score.toFixed(4)}`);
      } else {
        echecs += 1;
        const diff = join(HERE, `echec-${etiquette}.png`);
        cpSync(prise, diff);
        console.error(
          `  ✗ ${etiquette.padEnd(26)} ${score.toFixed(4)} — capture gardée : ${diff}`
        );
      }
    }
  } finally {
    if (garder) console.log(`  projet gardé      ${dir}`);
    else rmSync(dir, { recursive: true, force: true });
  }

  return echecs;
}

main();
