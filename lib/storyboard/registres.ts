import type { z } from 'zod';
import type { Transition, sceneEffectsSchema } from './render';

/**
 * La traduction d'une intention en effets.
 *
 * **Pourquoi ce fichier existe.** `prompt.ts` déverse au modèle les 43 nappes,
 * les 35 transitions et les 55 titres, et lui demande de choisir. Un LLM ne
 * voit pas ses rendus : il choisit `auroraDrift` par corrélation de mots, pas
 * parce que c'était joli. Sur un menu de trois cents entrées, il choisit par
 * variété — et la vidéo sort en catalogue.
 *
 * Ce qu'il fait bien, en revanche, c'est reconnaître qu'une phrase pose un
 * fait, appuie dessus, ou change de sujet. Ça, c'est du sens. Le modèle rend
 * donc **deux mots** — un registre pour la vidéo, un ton par scène — et c'est
 * le code qui les habille.
 *
 * Un réalisateur ne dit pas « objectif 35 mm f/1.4 », il dit « serré, tendu ».
 * Ce fichier est le chef op.
 */

export type SceneEffects = z.infer<typeof sceneEffectsSchema>;

/**
 * Les registres, c'est-à-dire les familles de vidéo que nous savons habiller.
 *
 * Un seul pour l'instant, et c'est volontaire : la table ne vaut que si un
 * registre rend **toujours pareil**, ce qui se vérifie en comparant deux
 * rendus, pas en en déclarant quatre. Les suivants entrent quand `explainer`
 * a tenu.
 */
export const REGISTRES = ['explainer'] as const;
export type Registre = (typeof REGISTRES)[number];

/**
 * Le ton d'une scène : ce que la phrase fait, pas ce qu'elle dit.
 *
 * Trois valeurs, et pas plus. C'est la borne haute de ce qu'un modèle choisit
 * de façon reproductible d'une génération à l'autre — au-delà, il recommence à
 * varier pour varier.
 *
 * - `pose` : la phrase avance, sans relief. Le cas par défaut.
 * - `appui` : la phrase porte le point. Une ou deux par vidéo.
 * - `bascule` : on quitte le sujet précédent. C'est une coupe, pas un accent.
 */
export const TONS = ['pose', 'appui', 'bascule'] as const;
export type Ton = (typeof TONS)[number];

/** Le ton retenu quand le modèle n'en écrit pas — et il en oubliera. */
export const TON_PAR_DEFAUT: Ton = 'pose';

type Place = {
  /** L'ordre de la scène, à partir de 0. Il porte l'alternance du zoom. */
  index: number;
  /** Combien de scènes en tout. Sans lui, pas de fermeture. */
  total: number;
};

type Fiche = {
  /** La ligne dite au modèle. Une phrase, pas une liste d'effets. */
  phrase: string;
  /**
   * Les bornes de durée d'une scène, en secondes.
   *
   * `MIN_SCENE_SECONDS` et `MAX_SCENE_SECONDS` valent 1 et 30 dans `service.ts` :
   * ce sont des garde-fous, pas un rythme. Un registre, lui, dit à quelle
   * cadence il se regarde — et c'est ce chiffre qui part dans le prompt, en
   * caractères de narration.
   */
  rythme: { min: number; max: number };
  /**
   * Les seules transitions que ce registre s'autorise.
   *
   * Le contrat en connaît trente-cinq. Un registre en prend trois ou quatre :
   * c'est ce qui fait qu'une vidéo se tient au lieu de faire la démonstration
   * du moteur.
   */
  transitions: readonly Transition[];
  /** Recollé devant chaque prompt visuel, à la place d'une constante en dur. */
  prefixeVisuel: string;
  /**
   * Ce qui ne doit pas changer d'un plan à l'autre.
   *
   * Le cadreur tient déjà le casting — qui est à l'image. Les ancrages tiennent
   * le reste : la lumière, la palette, le rendu. Deux plans du même film ne
   * peuvent pas être éclairés par deux personnes différentes.
   */
  ancrages: readonly string[];
  /**
   * Ce que le registre refuse, vérifié par `controles.ts` avant le rendu.
   *
   * Des contrôles, pas des réglages : le contraste minimum entre un texte et
   * son fond, et le plafond de couleurs à l'écran en même temps, fond exclu.
   * La durée minimale, elle, est déjà dite par `rythme` — troisième règle.
   */
  qualite: { contrasteMin: number; couleursMax: number };
  /**
   * Ce que le registre demande à l'oreille.
   *
   * L'humeur filtre le catalogue de sons, le lit sonore pose `musicVolume`,
   * et le ducking dit de combien la musique baisse quand la voix parle. Ce
   * dernier est porté ici mais lu par personne pour l'instant : la
   * composition pose un `data-volume` constant sur la piste musique, et
   * l'appliquer est un suivi, pas un oubli.
   */
  audio: {
    /** Mots d'humeur du catalogue (`mood`), en minuscules. */
    humeur: readonly string[];
    /** Le volume du lit musical, de 0 à 1. */
    litSonore: number;
    /** La fraction retirée sous la voix, de 0 à 1. */
    ducking: number;
  };
  /**
   * Comment la phrase doit être dite.
   *
   * La diction en mots à nous, la voix par défaut des projets sans voix, et
   * l'exagération du style lue par ElevenLabs. Nom court sans préfixe :
   * chaque fournisseur résout ou retombe sur sa voix par défaut — `lea` chez
   * Edge comme chez Polly — là où une forme préfixée ne résout nulle part.
   */
  voix: {
    /** L'intention : posée, chaleureuse, nette. */
    diction: readonly string[];
    /** Le nom court de la voix par défaut. */
    voix: string;
    /** L'exagération du style, de 0 à 1, pour qui sait la lire. */
    style: number;
  };
  habille: (ton: Ton, place: Place) => SceneEffects;
};

/**
 * `explainer` : le tutoriel, la vidéo pédagogique, l'explication de produit.
 *
 * La règle qui gouverne le reste : **rien ne doit détourner de la phrase**. Pas
 * de nappe, pas de flash, pas de shader. Le mouvement sert seulement à empêcher
 * l'image de mourir à l'écran.
 *
 * Le zoom alterne sur la parité de la scène. Ce n'est pas une décoration : sept
 * zooms avant d'affilée donnent l'impression d'une seule scène qui n'en finit
 * pas, et le spectateur cesse de compter les plans.
 *
 * **Le mouvement de caméra a une grammaire, pas un catalogue.** Quatre valeurs,
 * un sens chacune — `dolly` on entre, `pan` on se déplace, `orbit` on prend du
 * recul, `static` on se pose — et `static` reste majoritaire. Un mouvement sur
 * chaque plan ne se lit plus comme une intention, juste comme du roulis.
 *
 * Il ne vaut que pour les plans animés : `animationPrompt()` le traduit en
 * phrase pour le modèle vidéo (`clips.ts`), et une image fixe l'ignore — c'est
 * le zoom qui la fait bouger.
 */
const EXPLAINER: Fiche = {
  phrase:
    'explainer — a tutorial or product explanation. Nothing must pull attention away from the sentence.',
  // Sous trois secondes une phrase n'a pas fini d'être comprise ; au-delà de
  // neuf, l'image a fini de dire ce qu'elle avait à dire.
  rythme: { min: 3, max: 9 },
  transitions: ['none', 'fade', 'black', 'push-left'],
  prefixeVisuel:
    'clean documentary photography, natural light, realistic textures, unstaged',
  ancrages: [
    'the same soft daylight in every shot, no dramatic or coloured lighting',
    'the same muted palette throughout, nothing saturated',
    'photographic, never illustrated, never 3D',
    // Le cadrage par défaut, jusque-là écrit en dur dans `visualPrompt()`.
    // C'est bien une décision de registre : un registre plus nerveux
    // demanderait des gros plans.
    'medium shot or wide shot unless the prompt explicitly asks for a close-up',
  ],
  // 4,5:1 est le seuil AA du texte courant ; trois couleurs, fond exclu, c'est
  // la palette — tout plan qui en pose une quatrième la pose contre le registre.
  qualite: { contrasteMin: 4.5, couleursMax: 3 },
  // Une musique qu'on n'entend pas : autour de 0,08, et un ducking franc —
  // sous la voix, le lit tombe de moitié. Les mots existent tels quels dans
  // le catalogue : `planant` et `paisible` pour weightless-horizon, `chaleureux`
  // pour beneath-the-heavy-wool. L'énergique et le grandiose restent dehors.
  audio: { humeur: ['paisible', 'planant', 'chaleureux'], litSonore: 0.08, ducking: 0.5 },
  // Posée : l'exagération reste basse. `anais` plutôt que le `george` global —
  // une voix féminine francophone pour expliquer, et un nom court que les trois
  // fournisseurs résolvent ou remplacent par leur défaut.
  voix: { diction: ['posée', 'chaleureuse', 'nette'], voix: 'anais', style: 0.2 },
  habille(ton, { index, total }) {
    const respiration = index % 2 === 0 ? 'in' : 'out';

    // L'ouverture n'a rien sous elle : aucune transition à jouer. La caméra
    // entre dans le sujet, c'est le seul plan où l'on s'autorise à pousser
    // sans que la phrase l'ait demandé.
    if (index === 0) {
      return { transition: 'none', zoom: 'in', cameraMotion: 'dolly' };
    }

    // La fermeture recule. `black` coupe au noir avant elle : la vidéo se
    // termine sur un plan, pas sur un fondu qui traîne.
    if (index === total - 1) {
      return { transition: 'black', zoom: 'out', cameraMotion: 'orbit' };
    }

    if (ton === 'bascule') {
      // On change de sujet : la coupe doit s'entendre. Une poussée dit que la
      // vidéo est passée ailleurs, là où un fondu dirait la continuité — et le
      // panoramique va dans le même sens que la poussée, au lieu de la
      // contredire.
      return { transition: 'push-left', zoom: 'none', cameraMotion: 'pan' };
    }

    if (ton === 'appui') {
      // Un seul accent, et il est sur le rythme. `beatAccent` se cale tout seul
      // sur le pic musical le plus proche : pas de `onBeat` à poser ici.
      return {
        transition: 'fade',
        zoom: 'in',
        cameraMotion: 'dolly',
        // 0,06 est le plafond du schéma, et le commentaire qui le pose dit
        // pourquoi : au-delà, le souffle se lit comme un défaut. 0,35 faisait
        // rejeter le contrat de rendu entier — la scène perdait tout, pas
        // seulement son accent.
        beatAccent: { strength: 0.05 },
      };
    }

    return { transition: 'fade', zoom: respiration, cameraMotion: 'static' };
  },
};

const FICHES: Record<Registre, Fiche> = {
  explainer: EXPLAINER,
};

/**
 * Les bornes de narration d'une scène, en caractères.
 *
 * Le modèle n'écrit pas de durée — elle est mesurée après coup — donc on lui
 * parle dans la seule unité qu'il maîtrise : la longueur du texte. Quatorze
 * caractères par seconde est le débit retenu dans `docs/providers.md`.
 */
export const CARACTERES_PAR_SECONDE = 14;

/**
 * Les lignes de registre, pour le prompt système.
 *
 * Elles se lisent dans la table plutôt que d'être recopiées à la main : une
 * liste parallèle à une table finit toujours par mentir, et `prompt.ts` en
 * porte déjà la cicatrice.
 *
 * Le modèle n'écrit jamais de durée — elle est mesurée après coup — donc on
 * lui parle en caractères, via `bornesDeNarration()`.
 */
export function lignesDesRegistres(): string[] {
  return Object.entries(FICHES).map(([nom, fiche]) => {
    const bornes = bornesDeNarration(nom);
    return (
      `    \`${nom}\` ${fiche.phrase} Each scene holds ${bornes.min}` +
      ` to ${bornes.max} characters of narration.` +
      ` It wants a ${fiche.audio.humeur.join(', ')} music bed.`
    );
  });
}

/** La fiche d'un registre, `explainer` si le nom est inconnu. */
function ficheDe(registre: string | undefined): Fiche {
  return FICHES[(registre ?? '') as Registre] ?? EXPLAINER;
}

export function bornesDeNarration(registre?: string): { min: number; max: number } {
  const { rythme } = ficheDe(registre);
  return {
    min: Math.round(rythme.min * CARACTERES_PAR_SECONDE),
    max: Math.round(rythme.max * CARACTERES_PAR_SECONDE),
  };
}

/** Ce que ce registre demande à l'oreille : humeur, lit sonore, ducking. */
export function audioDe(
  registre?: string
): { humeur: readonly string[]; litSonore: number; ducking: number } {
  return ficheDe(registre).audio;
}

/** Comment ce registre veut qu'on parle : diction, voix par défaut, style. */
export function voixDe(
  registre?: string
): { diction: readonly string[]; voix: string; style: number } {
  return ficheDe(registre).voix;
}

/** Les transitions que ce registre s'autorise. */
export function transitionsDe(registre?: string): readonly Transition[] {
  return ficheDe(registre).transitions;
}

/** Ce que ce registre refuse : contraste minimum et plafond de couleurs. */
export function qualiteDe(registre?: string): { contrasteMin: number; couleursMax: number } {
  return ficheDe(registre).qualite;
}

/**
 * Le plancher de durée d'une scène, en secondes.
 *
 * C'est la borne basse du rythme — et la troisième règle de `controles.ts` :
 * sous elle, un plan ne tient pas à l'écran.
 */
export function dureeMinDe(registre?: string): number {
  return ficheDe(registre).rythme.min;
}

/**
 * Le style visuel du registre, recollé sur chaque prompt.
 *
 * Remplace la constante `STYLE` que chaque script de démonstration écrivait
 * dans son coin : le style appartient au registre, pas au fichier qui
 * l'appelle.
 */
export function styleDe(registre?: string): string {
  const fiche = ficheDe(registre);
  return [fiche.prefixeVisuel, ...fiche.ancrages].join(', ');
}

/**
 * Traduit une intention en effets de scène.
 *
 * `index` est l'ordre de la scène dans la vidéo, à partir de 0, et `total` le
 * nombre de scènes : la première et la dernière sont habillées par leur place
 * avant de l'être par leur ton — une ouverture reste une ouverture, même si la
 * phrase appuie.
 *
 * Un registre inconnu retombe sur `explainer` — un storyboard ne doit pas
 * échouer parce que le modèle a inventé un mot.
 */
export function habille(
  registre: string | undefined,
  ton: string | undefined,
  index: number,
  total: number
): SceneEffects {
  const fiche = ficheDe(registre);
  const retenu = (TONS as readonly string[]).includes(ton ?? '')
    ? (ton as Ton)
    : TON_PAR_DEFAUT;
  return fiche.habille(retenu, { index, total: Math.max(total, index + 1) });
}
