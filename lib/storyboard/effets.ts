import { z } from 'zod';

/**
 * Les nappes d'effet : un élément posé dans la scène, sans contenu.
 *
 * Trente demandes du palier 2 en une journée, toutes de la même forme — un
 * champ optionnel, un div avec un identifiant, deux ou trois variables CSS, un
 * instant. Les écrire une par une, c'était quatre éditions chacune dans quatre
 * fichiers, et `sceneEffectsSchema` qui double de taille.
 *
 * Elles sont donc déclarées ici, et le schéma, le balisage et la timeline se
 * lisent tous les trois dans cette table. Ajouter un effet est une ligne.
 *
 * **Ce que cette table ne peut pas porter :** un effet dont le contenu est une
 * donnée. Un organigramme qui reçoit `nodesCount: 4` dessine quatre boîtes
 * vides, et le storyboard n'a aucun moyen de dire ce qu'il y a dedans. Ceux-là
 * sont des plans de palier 3, pas des effets — voir `plans.ts`.
 */

/**
 * Comment un effet se place dans le temps.
 *
 *  - `etat` : aucune donnée de temps. Il est là ou il n'est pas.
 *  - `ponctuel` : un instant et une durée courte. Se cale sur la musique quand
 *    la scène le demande.
 *  - `ambiance` : commence avec la scène et tient jusqu'à sa fin, bornée par
 *    elle — une nappe qui survivrait à son plan se poserait sur le suivant.
 */
export type Minutage = 'etat' | 'ponctuel' | 'ambiance';

export type Effet = {
  /** La classe CSS, et la racine de l'identifiant. */
  classe: string;
  id: string;
  minutage: Minutage;
  /** Départ par défaut, en secondes depuis le début de la scène. */
  depart?: number;
  /** Durée par défaut. Ignorée par `etat`, bornée par la scène en `ambiance`. */
  duree?: number;
  /** Se cale sur le pic le plus proche quand `onBeat` est vrai. */
  surLeTemps?: boolean;
  /**
   * Sous le média plutôt qu'au-dessus.
   *
   * Un fond n'a de sens que sur un plan sans image : le média le recouvre. On
   * le pose quand même sous lui pour que le storyboard n'ait pas à savoir si
   * la scène a une illustration.
   */
  fond?: boolean;
  /** Les réglages, avec leur variable CSS et leur valeur par défaut. */
  reglages: Record<string, { css?: string; defaut: number | string | boolean }>;
};

export const EFFETS: Record<string, Effet> = {
  vignette: {
    classe: 'vignette',
    id: 'vg',
    minutage: 'etat',
    reglages: { strength: { css: '--vg-strength', defaut: 0.55 } },
  },
  shockRing: {
    classe: 'shock-ring',
    id: 'sr',
    minutage: 'ponctuel',
    depart: 0.3,
    duree: 0.6,
    surLeTemps: true,
    reglages: { color: { css: '--ring-color', defaut: '#ce1f20' } },
  },
  featherSpot: {
    classe: 'feather-spot',
    id: 'fs',
    minutage: 'ambiance',
    reglages: {
      x: { css: '--spot-x', defaut: 50 },
      y: { css: '--spot-y', defaut: 42 },
      size: { css: '--spot-size', defaut: 40 },
    },
  },
  gridDrift: {
    classe: 'grid-drift',
    id: 'gd',
    minutage: 'ambiance',
    fond: true,
    reglages: { opacity: { defaut: 0.5 } },
  },
  auroraDrift: {
    classe: 'aurora',
    id: 'au',
    minutage: 'ambiance',
    fond: true,
    reglages: { opacity: { defaut: 0.8 } },
  },
  scanGate: {
    classe: 'scan-gate',
    id: 'sg',
    minutage: 'ponctuel',
    depart: 0.4,
    duree: 1.2,
    surLeTemps: true,
    reglages: { color: { css: '--gate-color', defaut: '#4ad9ff' } },
  },
  outlineDraw: {
    classe: 'outline-draw',
    id: 'od',
    minutage: 'ponctuel',
    depart: 0.4,
    duree: 1,
    surLeTemps: true,
    reglages: { color: { css: '--trace-color', defaut: '#ffd9a0' } },
  },
  toggleFlip: {
    classe: 'toggle-flip',
    id: 'tf',
    minutage: 'ponctuel',
    depart: 0.5,
    duree: 0.7,
    reglages: { on: { defaut: true } },
  },
  /*
   * Le curseur est le seul dont les coordonnées partent en pixels.
   *
   * La garde refuse d'animer `left` et `top` : le moteur les arrondit au pixel
   * et le déplacement saute. Le balisage pose donc le départ en pourcents, et
   * la timeline n'anime que `x` et `y` — qui, eux, demandent des pixels, donc
   * le format exact de la vidéo.
   */
  cursorClick: {
    classe: 'cursor-click',
    id: 'cc',
    minutage: 'ponctuel',
    depart: 0.5,
    duree: 0.9,
    reglages: {
      x: { defaut: 62 },
      y: { defaut: 55 },
      fromX: { css: 'left', defaut: 12 },
      fromY: { css: 'top', defaut: 12 },
    },
  },
  mkBackground: {
    classe: 'mk-bg',
    id: 'mb',
    minutage: 'ambiance',
    fond: true,
    reglages: { opacity: { defaut: 0.9 } },
  },
  ytLcdBackground: {
    classe: 'lcd-bg',
    id: 'lb',
    minutage: 'ambiance',
    fond: true,
    reglages: { opacity: { defaut: 0.85 } },
  },
  meshGradientBg: {
    classe: 'mesh-bg',
    id: 'mg',
    minutage: 'ambiance',
    fond: true,
    reglages: { opacity: { defaut: 0.8 } },
  },
  beatPulseBackground: {
    classe: 'beat-bg',
    id: 'bp',
    minutage: 'ambiance',
    fond: true,
    reglages: { opacity: { defaut: 0.7 } },
  },
  grainField: {
    classe: 'grain-field',
    id: 'gf',
    minutage: 'ambiance',
    fond: true,
    reglages: { density: { defaut: 0.5 } },
  },
  camcorderHud: {
    classe: 'camcorder-hud',
    id: 'ch',
    minutage: 'ambiance',
    reglages: { rec: { defaut: true } },
  },
  ytScreenWarp: {
    classe: 'screen-warp',
    id: 'sw',
    minutage: 'ambiance',
    reglages: { opacity: { defaut: 0.8 } },
  },
  ytFeatherHighlight: {
    classe: 'feather-highlight',
    id: 'fh',
    minutage: 'ambiance',
    reglages: {
      x: { css: '--fh-x', defaut: 50 },
      y: { css: '--fh-y', defaut: 50 },
      size: { css: '--fh-size', defaut: 35 },
    },
  },
  lightSweepPass: {
    classe: 'light-sweep-pass',
    id: 'lsp',
    minutage: 'ponctuel',
    depart: 0.2,
    duree: 1.5,
    reglages: { opacity: { defaut: 0.7 } },
  },
  glossSweep: {
    classe: 'gloss-sweep',
    id: 'gs',
    minutage: 'ponctuel',
    depart: 0.3,
    duree: 1.0,
    reglages: { opacity: { defaut: 0.6 } },
  },
  inlineHighlight: {
    classe: 'inline-highlight',
    id: 'ih',
    minutage: 'ponctuel',
    depart: 0.4,
    duree: 0.8,
    reglages: { color: { css: '--hl-color', defaut: '#ffe066' } },
  },
  confetti: {
    classe: 'confetti-burst',
    id: 'cf',
    minutage: 'ponctuel',
    depart: 0.2,
    duree: 1.5,
    surLeTemps: true,
    reglages: { count: { defaut: 30 } },
  },

  /*
   * Dix-neuf nappes de plus, du troisième lot des demandes du palier 2.
   *
   * Toutes se dessinent au repos, sans attendre leur tween. C'est délibéré :
   * une nappe posée à `opacity: 0` qui attend un tween qui n'arrive pas ne
   * dessine rien, et c'est précisément la panne qu'on vient de mesurer cent
   * soixante fois. Le tween les anime ensuite ; il ne les fait pas exister.
   *
   * Aucune ne porte de contenu. Les maquettes d'interface — le formulaire,
   * les réglages, l'éditeur — sont des **squelettes**, des pavés gris sans
   * texte : le storyboard n'a aucun libellé à leur donner, et un faux libellé
   * inventé par le modèle serait pire que pas de libellé du tout. C'est aussi
   * ce que font les vraies vidéos de produit derrière un sujet.
   */

  /** Un filet d'un pixel, horizontal ou vertical. */
  separator: {
    classe: 'separator',
    id: 'sep',
    minutage: 'ponctuel',
    depart: 0.2,
    duree: 0.6,
    reglages: {
      orientation: { css: '--sep-dir', defaut: 'horizontal' },
      color: { css: '--sep-color', defaut: 'rgba(255,255,255,0.55)' },
    },
  },
  /** Une piste de chargement dont le segment court. */
  svgLineDrawLoader: {
    classe: 'line-loader',
    id: 'lld',
    minutage: 'ambiance',
    reglages: { color: { css: '--loader-color', defaut: '#4ad9ff' } },
  },
  /** Un treillis de cellules qui se découvre en diagonale. */
  staggerLattice: {
    classe: 'lattice',
    id: 'lat',
    minutage: 'ambiance',
    fond: true,
    reglages: { color: { css: '--lat-color', defaut: 'rgba(255,255,255,0.14)' } },
  },
  /** L'ellipse d'annotation tracée à la volée. */
  ytCirclePointer: {
    classe: 'circle-pointer',
    id: 'cp',
    minutage: 'ponctuel',
    depart: 0.4,
    duree: 1,
    reglages: {
      color: { css: '--cp-color', defaut: '#ffd400' },
      x: { css: 'left', defaut: 50 },
      y: { css: 'top', defaut: 46 },
    },
  },
  /** Une colonne de cartes squelettes qui remonte. */
  scrollFeed: {
    classe: 'scroll-feed',
    id: 'sf',
    minutage: 'ambiance',
    reglages: {},
  },
  /** Des bandeaux de notification qui s'empilent en haut. */
  notificationPileup: {
    classe: 'notif-pile',
    id: 'np',
    minutage: 'ponctuel',
    depart: 0.3,
    duree: 1.4,
    reglages: {},
  },
  /** Une carte qui s'ouvre en panneau. */
  modalMorph: {
    classe: 'modal-morph',
    id: 'mm',
    minutage: 'ponctuel',
    depart: 0.3,
    duree: 1,
    reglages: {},
  },
  /** Le cadre d'un téléphone posé au centre. */
  deviceFrameStage: {
    classe: 'device-frame',
    id: 'df',
    minutage: 'etat',
    reglages: {},
  },
  /** Un trait de feutre sur un tableau blanc. */
  whiteboardInk: {
    classe: 'whiteboard-ink',
    id: 'wi',
    minutage: 'ponctuel',
    depart: 0.3,
    duree: 1.2,
    reglages: { color: { css: '--ink-color', defaut: '#1f6feb' } },
  },
  /** Une liste tirée vers le bas, et son ressort. */
  pullToRefresh: {
    classe: 'pull-refresh',
    id: 'pr',
    minutage: 'ponctuel',
    depart: 0.3,
    duree: 1.2,
    reglages: {},
  },
  /** Un rail d'étapes franchies l'une après l'autre. */
  onboardingStepperFlow: {
    classe: 'stepper-flow',
    id: 'osf',
    minutage: 'ambiance',
    reglages: { color: { css: '--step-color', defaut: '#4ad9ff' } },
  },
  /** Des interrupteurs de réglages, dont un basculé. */
  settingsToggleFlow: {
    classe: 'settings-flow',
    id: 'stf',
    minutage: 'ambiance',
    reglages: {},
  },
  /** Un formulaire d'inscription, en squelette. */
  signupFlow: {
    classe: 'signup-flow',
    id: 'sgf',
    minutage: 'ambiance',
    reglages: { color: { css: '--form-accent', defaut: '#ce1f20' } },
  },
  /** La barre d'outils d'un éditeur vectoriel, et son tracé. */
  vectorEditorRig: {
    classe: 'vector-rig',
    id: 'vr',
    minutage: 'ambiance',
    reglages: {},
  },
  /** Une pile de cartes décalées, comme une piste de montage. */
  keyframeScrubStack: {
    classe: 'scrub-stack',
    id: 'kss',
    minutage: 'ambiance',
    reglages: {},
  },
  /** Trois cartes en profondeur, vues de biais. */
  cameraRigDepthStack: {
    classe: 'depth-stack',
    id: 'drs',
    minutage: 'ambiance',
    reglages: {},
  },
  /** Un point qui suit un arc, et l'arc derrière lui. */
  arcMotionPath: {
    classe: 'arc-path',
    id: 'amp',
    minutage: 'ponctuel',
    depart: 0.3,
    duree: 1.2,
    reglages: { color: { css: '--arc-color', defaut: '#ffd9a0' } },
  },
  /** Le rond de contact d'un doigt sur l'écran. */
  touchIndicator: {
    classe: 'touch-indicator',
    id: 'ti',
    minutage: 'ponctuel',
    depart: 0.4,
    duree: 0.9,
    reglages: {
      x: { css: 'left', defaut: 50 },
      y: { css: 'top', defaut: 55 },
    },
  },
  /** La traînée de glyphes derrière un curseur. */
  cursorGlyphTrail: {
    classe: 'glyph-trail',
    id: 'gt',
    minutage: 'ambiance',
    reglages: { color: { css: '--trail-color', defaut: 'rgba(255,255,255,0.5)' } },
  },
};

/** Le champ optionnel d'un effet, tel que le contrat le porte. */
function champ(effet: Effet) {
  const forme: Record<string, z.ZodTypeAny> = {};
  for (const [nom, reglage] of Object.entries(effet.reglages)) {
    forme[nom] =
      typeof reglage.defaut === 'boolean'
        ? z.boolean().optional()
        : typeof reglage.defaut === 'number'
          ? z.number().optional()
          : z.string().optional();
  }
  if (effet.minutage !== 'etat') {
    forme.startInSeconds = z.number().min(0).optional();
    forme.durationInSeconds = z.number().positive().optional();
  }
  return z.object(forme).optional();
}

/** Les entrées à fusionner dans `sceneEffectsSchema`. */
export const EFFETS_SCHEMA = Object.fromEntries(
  Object.entries(EFFETS).map(([nom, effet]) => [nom, champ(effet)])
) as Record<string, z.ZodTypeAny>;

/**
 * La famille manuscrite, à part du reste.
 *
 * Elle porte du **contenu** — un libellé, une légende, des nœuds nommés — là
 * où les nappes ci-dessus n'ont que des réglages. Son balisage ne se déduit
 * donc pas d'une fiche : il vit dans `lib/render/manuscrit.ts`, avec ses
 * tracés tremblés.
 *
 * Le tremblement (`boil`) est semé sur l'indice de la scène. Un tirage au
 * hasard dans la page donnerait un trait différent à chaque image, et le
 * moteur cherche chaque image : le trait grouillerait.
 */
const tempsManuscrit = {
  startInSeconds: z.number().min(0).optional(),
  durationInSeconds: z.number().positive().optional(),
  /** L'ampleur du tremblement, en unités du tracé. Zéro donne un trait net. */
  boil: z.number().min(0).max(4).optional(),
  color: z.string().optional(),
};

export const MANUSCRIT_SCHEMA = {
  /** Le tremblement seul, appliqué à tout ce que la scène trace à la main. */
  hwBoil: z
    .object({
      amount: z.number().min(0).max(4).optional(),
      startInSeconds: z.number().min(0).optional(),
      durationInSeconds: z.number().positive().optional(),
    })
    .optional(),
  /** Un encadré tracé autour d'un mot, avec son libellé. */
  hwBoxLabel: z.object({ label: z.string().max(60).optional(), ...tempsManuscrit }).optional(),
  /** Un rond entouré à la main, posé où la scène le demande. */
  hwCalloutCircle: z
    .object({
      label: z.string().max(60).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      size: z.number().optional(),
      ...tempsManuscrit,
    })
    .optional(),
  /** Un cadre dessiné autour du plan, avec sa légende. */
  hwFrame: z.object({ caption: z.string().max(90).optional(), ...tempsManuscrit }).optional(),
  /**
   * Un enchaînement de boîtes reliées.
   *
   * `nodes` porte les **noms**, pas leur nombre : une chaîne de trois boîtes
   * vides ne dit rien, et le modèle ne peut pas la remplir après coup.
   */
  hwPipeline: z
    .object({
      nodes: z.array(z.string().max(24)).min(2).max(5),
      ...tempsManuscrit,
    })
    .optional(),
} as const;
