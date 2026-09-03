import type { Shot, Video } from '@/lib/db/schema';
import type { SceneRender } from '@/lib/storyboard/render';
import { titleTargets } from '@/lib/render/plan';
import {
  toHyperframesStoryboard,
  transitionDurationSeconds,
} from '@/lib/storyboard/render';

/**
 * Le storyboard de référence.
 *
 * Rien ici n'est généré : quatre fonds unis et un silence, commités dans le
 * dépôt. C'est la condition pour qu'une régression visuelle soit détectable —
 * si l'image d'entrée change, l'image de sortie change, et le test ne dit plus
 * rien sur le moteur.
 *
 * Les durées sont écrites à la main, contrairement à la production où elles
 * viennent de la voix off mesurée. Une durée mesurée dépendrait du service de
 * synthèse, donc du réseau, donc du jour.
 *
 * Chaque scène couvre une chose et une seule, pour qu'un échec nomme le
 * coupable au lieu de dire « la vidéo a changé ».
 */

type Fixture = { seconds: number; media: number | null; render: SceneRender };

/**
 * Le titre de la scène d'ouverture, et les réglages que la timeline lui
 * applique par défaut. Repris ici pour que `momentDuTitre` puisse calculer
 * quand l'animation finit sans rendre la page d'abord.
 */
const TITRE_DE_REFERENCE = 'TITRE CINETIQUE';
const DUREE_PAR_DEFAUT = 0.5;
const STAGGER_PAR_DEFAUT = 0.08;

const FIXTURES: Fixture[] = [
  // 1. L'ouverture : aucune transition, un zoom avant, un titre cinétique.
  {
    seconds: 3,
    media: 1,
    render: {
      effects: { transition: 'none', zoom: 'in' },
      kineticTitle: { text: TITRE_DE_REFERENCE, variant: 'reveal', position: 'center' },
      // Deux mots porteurs, pour que les styles qui accentuent aient de quoi.
      emphasis: ['trois', 'six'],
    },
  },
  // 2. Un fondu enchaîné, le geste le plus banal et le plus utilisé.
  { seconds: 3, media: 2, render: { effects: { transition: 'fade', zoom: 'out' } } },
  // 3. Une poussée : deux scènes à l'écran, celle qui sort et celle qui entre.
  { seconds: 3, media: 3, render: { effects: { transition: 'push-left' } } },
  // 4. Un shader : le compositeur prend la main sur la visibilité.
  {
    seconds: 3,
    media: 4,
    render: {
      effects: { transition: 'glitch' },
      overlayText: { text: 'Bandeau pose sur le plan' },
    },
  },
  // 5. Un compteur : aucune image, le plan se dessine seul.
  {
    seconds: 3,
    media: null,
    render: {
      effects: { transition: 'black' },
      counter: { value: 6000, label: 'unites comptees', durationInSeconds: 2 },
    },
  },
  // 6. Une carte de fin : ni voix, ni média, ni son.
  {
    seconds: 2,
    media: null,
    render: {
      effects: { transition: 'fade' },
      card: { text: 'Carte de fin', subtext: 'Reference visuelle' },
    },
  },
];

/** Une narration de longueur fixe : les mots portent le karaoké. */
const WORDS = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six'];

export function referenceShots(): Shot[] {
  return FIXTURES.map((fixture, index) => {
    const each = fixture.seconds / WORDS.length;
    const carte = Boolean(fixture.render.card);

    return {
      id: index + 1,
      order: index + 1,
      type: 'image',
      prompt: '',
      narration: carte ? null : WORDS.join(' '),
      subtitle: null,
      audioUrl: carte ? null : `voice/scene-${index + 1}.mp3`,
      assetUrl: fixture.media ? `media/scene-${fixture.media}.jpg` : null,
      sourceImageUrl: null,
      durationS: fixture.seconds,
      durationSource: 'measured',
      words: carte
        ? []
        : WORDS.map((text, i) => ({
            text,
            start: Math.round(i * each * 1000) / 1000,
            duration: Math.round(each * 1000) / 1000,
          })),
      /*
       * Une copie, jamais la fixture elle-même.
       *
       * Les passes imposent une variante de titre ou une transition en
       * écrivant dans `render` du plan rendu. Partagé, cet objet emportait la
       * dernière écriture dans tous les rendus suivants : le 2 septembre 2026,
       * les quatorze références de base ont été écrites avec la transition
       * `spin` parce qu'une passe l'avait posée là en calculant ses instants.
       */
      render: structuredClone(fixture.render),
    } as unknown as Shot;
  });
}

export const REFERENCE_VIDEO = {
  title: 'Reference visuelle GenTube',
  ratio: '16:9',
  resolution: '480p',
  voice: null,
  subtitles: true,
  subtitleStyle: 'karaoke',
  musicUrl: null,
  musicVolume: 0.09,
  sfxVolume: 1,
} as unknown as Video;

/**
 * La même référence, en vertical.
 *
 * `ratio` accepte `9:16` depuis l'origine et aucune composition n'y avait
 * jamais été rendue : les seuls tests vérifiaient que `dimensionsFor` rend les
 * bons nombres. Or c'est le format des Shorts et des Reels, et tout ce que la
 * composition dessine y change de proportions — les sous-titres, les titres
 * cinétiques, l'anneau du compteur.
 */
export const REFERENCE_VIDEO_VERTICALE = {
  ...REFERENCE_VIDEO,
  title: 'Reference visuelle GenTube — vertical',
  ratio: '9:16',
} as unknown as Video;

export type Moment = { at: number; nom: string };

/** Deux décimales : la capture est à la milliseconde près, pas au-delà. */
const arrondi = (secondes: number) => Math.round(secondes * 100) / 100;

/** Les scènes minutées, une transition de la troisième pouvant être imposée. */
function scenesMinutees(transition?: string) {
  const shots = referenceShots();
  if (transition) {
    const effects = (shots[2].render as { effects?: { transition?: string } }).effects;
    if (effects) effects.transition = transition;
  }
  return toHyperframesStoryboard(REFERENCE_VIDEO, shots).scenes;
}

/**
 * Les instants capturés, et ce que chacun surveille.
 *
 * **Calculés, plus écrits à la main.** Les sept étaient des nombres fixes
 * jusqu'au 2 septembre 2026, et six d'entre eux avaient dérivé : la durée des
 * scènes a changé sous eux, et l'instant nommé « poussée » tombait une seconde
 * avant le début de la poussée. La garde comparait des images stables qui ne
 * contenaient pas ce que leur nom promettait — verte, et aveugle.
 *
 * Un instant de coupe se prend au milieu du geste : une transition ne dit rien
 * à son premier pour cent. Un instant de contenu se prend une fois la coupe
 * finie, pour que le plan soit seul à l'écran.
 */
export function momentsDeReference(): Moment[] {
  const scenes = scenesMinutees();
  const auMilieuDeLaCoupe = (index: number) =>
    arrondi(
      scenes[index].startInSeconds +
        transitionDurationSeconds(FIXTURES[index].render.effects?.transition) / 2
    );
  const dansLaScene = (index: number, apres: number) =>
    arrondi(scenes[index].startInSeconds + apres);

  return [
    { at: dansLaScene(0, 1.2), nom: 'titre-cinetique' },
    { at: auMilieuDeLaCoupe(1), nom: 'fondu-enchaine' },
    { at: auMilieuDeLaCoupe(2), nom: 'poussee-gauche' },
    { at: auMilieuDeLaCoupe(3), nom: 'shader-glitch' },
    { at: dansLaScene(3, 2), nom: 'bandeau' },
    { at: dansLaScene(4, 1.5), nom: 'compteur' },
    { at: dansLaScene(5, 1.2), nom: 'carte-de-fin' },
  ];
}

/**
 * Le milieu de la troisième coupe, pour une transition imposée.
 *
 * Chaque transition a sa durée, et la durée d'une coupe décale le début de la
 * scène qui arrive : l'instant se recalcule pour chacune, il ne se partage pas.
 */
/**
 * Le milieu de l'animation du titre, variante par variante.
 *
 * Un instant unique ne pouvait pas convenir aux deux familles : les variantes
 * qui animent le **mot** ont deux cibles et ont fini en 0,58 s, celles qui
 * animent la **lettre** en ont quatorze et courent jusqu'à 1,62 s. L'ancien
 * instant partagé — 1,2 s — tombait après la fin des premières : les vingt-sept
 * références montraient le même titre au repos, et une variante qui aurait
 * cessé de s'animer serait passée pour conforme.
 *
 * La durée totale est celle du dernier décalage plus un tween, et on la coupe
 * en deux : la moitié des cibles a bougé, l'autre pas.
 */
export function momentDuTitre(variant: string): Moment {
  const titre = { text: TITRE_DE_REFERENCE, variant };
  const cibles = titleTargets(titre, 0).length;
  const totale = (cibles - 1) * STAGGER_PAR_DEFAUT + DUREE_PAR_DEFAUT;
  const scenes = scenesMinutees();
  return {
    at: arrondi(scenes[0].startInSeconds + totale / 2),
    nom: 'titre',
  };
}

/**
 * Le milieu de la montée du graphique.
 *
 * Les barres partent en décalé : la dernière commence quand les autres sont
 * déjà en route. L'animation entière court donc du premier départ à la fin de
 * la dernière barre, et c'est cette durée-là qu'on coupe en deux. Capturé
 * après, les deux types rendraient la même image finie et la garde ne dirait
 * plus rien.
 */
export const DEPART_DU_GRAPHIQUE = 0.8;

export function momentDuGraphique(kind: string): Moment {
  const scenes = scenesMinutees();
  const points = 3;
  const duree = 0.9;
  const totale =
    kind === 'line'
      ? duree * 1.6
      : Math.min(0.12, 0.5 / points) * (points - 1) + duree;
  return {
    // Le départ décalé n'est pas un réglage de goût : la cinquième scène entre
    // par un fondu au noir, et un graphique qui monterait pendant le rideau ne
    // se verrait pas du tout.
    at: arrondi(
      scenes[4].startInSeconds + DEPART_DU_GRAPHIQUE + totale / 2
    ),
    nom: 'graphique',
  };
}

/**
 * L'instant où le tiers inférieur est entièrement posé.
 *
 * Il entre en 0,4 s et sort avant la fin de la scène : capturé au début ou à
 * la fin, on photographierait un bloc à moitié translaté. Une seconde après
 * son entrée le laisse au repos, quelle que soit la variante.
 */
export function momentDuTiers(): Moment {
  const scenes = scenesMinutees();
  return { at: arrondi(scenes[1].startInSeconds + 1), nom: 'tiers' };
}

export function momentDeLaCoupe(transition: string): Moment {
  const scenes = scenesMinutees(transition);
  return {
    at: arrondi(scenes[2].startInSeconds + transitionDurationSeconds(transition) / 2),
    nom: 'coupe',
  };
}

export const MOMENTS: Moment[] = momentsDeReference();
