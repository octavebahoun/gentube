import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOVE_TRANSITIONS, toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { SUBTITLE_STYLES } from '@/lib/videos';
import {
  MOMENTS,
  momentDeLaCoupe,
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
const TITRES = [
  'reveal', 'typewriter', 'tracking', 'cascade', 'slam', 'rise', 'glitch',
  'blur-out', 'explode', 'focus', 'lines', 'lockup', 'decode', 'crossfade',
  'scan', 'axis-y', 'axis-z', 'reel', 'fade-up', 'strike', 'ticker', 'calm',
  'split', 'weight', 'wave', 'backdrop', 'drop',
].map((variant) => ({
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

/** Un projet jetable : le vrai style et le vrai vendor, des médias figés. */
function projet(jeu: Jeu): string {
  const { video, variant, transition } = jeu;
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
