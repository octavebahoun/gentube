import { z } from 'zod';
import type {
  Ratio,
  Resolution,
  Shot,
  SubtitleStyle,
  Video,
} from '@/lib/db/schema';

/**
 * Le contrat de rendu — vérité partagée entre la base de données et la
 * composition Hyperframes.
 *
 * C'est un port du schéma storyboard déjà en production dans le pipeline
 * pipevideo, conservé champ pour champ pour que la composition puisse être
 * réutilisée sans traduction. Deux conséquences à énoncer clairement :
 *
 *  - `durationInSeconds` et `words` ne sont JAMAIS rédigés à la main. Ce sont
 *    la longueur mesurée de la voix off et son alignement mot à mot, écrits
 *    par l'étape voix off. Une durée écrite à la main est un bug.
 *  - Tout ce qui est dans `sceneRenderSchema` est de la présentation. Cela vit
 *    dans la colonne jsonb `render` précisément pour qu'ajouter une transition
 *    ou une variante de titre soit un déploiement, pas une migration.
 */

export const wordTimingSchema = z.object({
  text: z.string(),
  /** Secondes depuis le début de la scène. */
  start: z.number(),
  duration: z.number(),
});

/** Un son joué pendant une scène, par-dessus la voix : SFX, ambiance, musique. */
export const sceneSoundSchema = z.object({
  /** Clé d'une ligne de `sound_assets`, ex. "sounds/sfx/pop.mp3". */
  src: z.string(),
  volume: z.number().min(0).max(1).optional(),
  startInSeconds: z.number().min(0).optional(),
  loop: z.boolean().optional(),
  fadeInSeconds: z.number().min(0).optional(),
  fadeOutSeconds: z.number().min(0).optional(),
  /**
   * Rognage du fichier source, pour isoler un impact d'une prise plus longue.
   *
   * **Pas encore rendu.** Le moteur ne lit que `data-start`, `data-duration`,
   * `data-volume` et `data-loop` sur une piste audio ; rien n'y décale la
   * lecture dans le fichier. Les champs restent au contrat parce qu'un
   * catalogue de sons en aura besoin, mais un storyboard qui les pose n'obtient
   * rien — et le prompt système ne les propose pas.
   */
  trimStart: z.number().min(0).optional(),
  trimEnd: z.number().min(0).optional(),
});

/**
 * Transitions rendues en CSS : elles n'ont pas d'équivalent shader et n'en
 * ont pas besoin. `none` ne dure rien, `black` passe par un noir franc.
 */
export const CSS_TRANSITIONS = ['none', 'fade', 'black'] as const;

/**
 * Transitions par transformation, transposées des paquets `transitions-*` du
 * registre HyperFrames (`docs/vocabulaire-de-rendu.md`).
 *
 * Elles déplacent ou redimensionnent les deux scènes au lieu de les mélanger.
 * Deux conséquences qui les rendent précieuses : elles ne demandent **aucun
 * WebGL**, donc elles rendent partout sans dépendre du compositeur de shaders ;
 * et elles couvrent des gestes qu'aucun shader ne fait — la poussée, l'écrasement,
 * le zoom traversant.
 *
 * Les transitions à flou du registre ne sont pas reprises : l'en-tête de
 * `render/gentube-v1/style.css` interdit le flou, que la rastérisation
 * logicielle de Lambda paie au triple.
 */
export const MOVE_TRANSITIONS = [
  'push-left',
  'push-right',
  'push-up',
  'zoom-through',
  'zoom-out',
  'squeeze',
] as const;

export type MoveTransition = (typeof MOVE_TRANSITIONS)[number];

/** Vrai quand la transition déplace les scènes au lieu de les mélanger. */
export function isMoveTransition(transition: string): boolean {
  return (MOVE_TRANSITIONS as readonly string[]).includes(transition);
}

/**
 * Transitions de `@hyperframes/shader-transitions`, reprises sous leurs noms
 * exacts.
 *
 * On adopte leur vocabulaire tel quel plutôt que de traduire le nôtre : une
 * table de correspondance entre deux jeux de noms ne peut que dériver, et
 * c'est le renderer qui a le dernier mot sur ce qui existe vraiment.
 */
export const SHADER_TRANSITIONS = [
  'domain-warp',
  'ridged-burn',
  'whip-pan',
  'sdf-iris',
  'ripple-waves',
  'gravitational-lens',
  'cinematic-zoom',
  'chromatic-split',
  'glitch',
  'swirl-vortex',
  'thermal-distortion',
  'flash-through-white',
  'cross-warp-morph',
  'light-leak',
] as const;

export const TRANSITIONS = [
  ...CSS_TRANSITIONS,
  ...MOVE_TRANSITIONS,
  ...SHADER_TRANSITIONS,
] as const;

export type Transition = (typeof TRANSITIONS)[number];

/** Vrai quand la transition doit être rendue par un shader WebGL. */
export function isShaderTransition(transition: string): boolean {
  return (SHADER_TRANSITIONS as readonly string[]).includes(transition);
}

/**
 * Les mouvements caméra sont des directives pour le *prompt*, pas pour le
 * renderer — et depuis le 2 septembre 2026 c'est vrai : `animationPrompt()`
 * dans `lib/storyboard/clips.ts` les traduit pour le modèle d'animation.
 * Auparavant la valeur était stockée et perdue là.
 */
export const CAMERA_MOTIONS = ['orbit', 'dolly', 'pan', 'static'] as const;

export const sceneEffectsSchema = z.object({
  zoom: z.enum(['in', 'out', 'none']).optional(),
  transition: z.enum(TRANSITIONS).optional(),
  shake: z.boolean().optional(),
  /**
   * Directive : ce plan doit couper nettement avec la composition précédente.
   *
   * **Mort des deux côtés, au 2 septembre 2026.** Le prompt système ne le
   * propose pas au modèle, et aucun rendu ne le lit. Gardé parce qu'un
   * raccord dans le mouvement est une vraie intention de montage — mais tant
   * que rien ne l'écrit ni ne le rend, il ne promet rien.
   */
  matchCut: z.boolean().optional(),
  /**
   * Cale les effets ponctuels de la scène sur un temps fort de la musique.
   *
   * Les fiches de `assets/sounds/` portent les secondes où un morceau frappe
   * réellement (`peaks`, repris en `sound_assets.impacts`). Un éclair posé à
   * 0,8 s de la scène tombe n'importe où ; le même éclair calé sur le pic le
   * plus proche fait entendre le montage. C'est ce qui sépare une vidéo
   * automatique d'une vidéo rythmée.
   *
   * Sans musique, ou sans pic assez proche, l'effet garde son instant écrit.
   */
  onBeat: z.boolean().optional(),
  cameraMotion: z.enum(CAMERA_MOTIONS).optional(),
  flash: z
    .object({
      startInSeconds: z.number().min(0).optional(),
      durationInSeconds: z.number().positive().optional(),
      color: z.string().optional(),
    })
    .optional(),
});

export const sceneRenderSchema = z.object({
  effects: sceneEffectsSchema.optional(),
  overlayText: z
    .object({
      text: z.string(),
      startInSeconds: z.number().min(0).optional(),
    })
    .optional(),
  kineticTitle: z
    .object({
      text: z.string(),
      startInSeconds: z.number().min(0).optional(),
      animationDuration: z.number().positive().optional(),
      staggerDelay: z.number().positive().optional(),
      highlightColor: z.string().optional(),
      fontSize: z.string().optional(),
      position: z.enum(['bottom', 'center']).optional(),
      variant: z.enum(['reveal', 'neon', 'icon', 'pin']).optional(),
      icon: z.string().optional(),
      iconLabel: z.string().optional(),
      glowColor: z.string().optional(),
    })
    .optional(),
  /**
   * Un chiffre qui monte.
   *
   * Le plan le moins cher du catalogue : **aucune image n'est générée**, donc
   * il ne coûte que sa voix off — dix FCFA la minute contre quatre cents pour
   * un plan illustré (`docs/tarifs.md`). C'est ce qui rend viable le genre
   * « les cinq chiffres de… », très courant en contenu sans visage.
   */
  counter: z
    .object({
      /** La valeur d'arrivée. C'est elle que le spectateur retient. */
      value: z.number(),
      /** Le départ. Zéro sauf si la progression elle-même veut dire quelque chose. */
      from: z.number().optional(),
      /** Ce que le chiffre compte. Sans lui, un nombre nu ne dit rien. */
      label: z.string().optional(),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      decimals: z.number().int().min(0).max(3).optional(),
      /** `count` monte en chiffres, `ring` remplit un anneau autour d'eux. */
      variant: z.enum(['count', 'ring']).optional(),
      startInSeconds: z.number().min(0).optional(),
      durationInSeconds: z.number().positive().optional(),
    })
    .optional(),
  /** Écran noir avec texte centré : pas de voix, pas de média, pas de son. */
  card: z
    .object({
      text: z.string(),
      subtext: z.string().optional(),
    })
    .optional(),
  /** Volume de l'audio propre au clip. 0 le rend muet. */
  mediaVolume: z.number().min(0).max(1).optional(),
  /** Ralentit un clip court pour remplir la scène sans boucle visible. */
  playbackRate: z.number().positive().optional(),
  showSubtitles: z.boolean().optional(),
  sounds: z.array(sceneSoundSchema).optional(),
});

/**
 * Vrai quand la scène dessine son propre contenu et n'a aucune image à
 * illustrer : une carte, un compteur.
 *
 * C'est cette fonction qui fait l'économie. Sans elle, l'étape image dessine
 * une illustration pour un écran qui ne la montrera jamais — et la facture.
 */
export function rendersOwnContent(render: unknown): boolean {
  const parsed = sceneRenderSchema.safeParse(render ?? {});
  if (!parsed.success) return false;
  return Boolean(parsed.data.card || parsed.data.counter);
}

export type WordTiming = z.infer<typeof wordTimingSchema>;
export type SceneSound = z.infer<typeof sceneSoundSchema>;
export type SceneRender = z.infer<typeof sceneRenderSchema>;

// ---------------------------------------------------------------------------
// Timing — une seule source de vérité, sinon les scènes sont tronquées
//
// Tout est en SECONDES, parce que Hyperframes déclare `data-start` et
// `data-duration` en secondes et parce que notre source de vérité — la durée
// mesurée sur l'audio — est déjà une durée en secondes. L'ancien modèle
// convertissait en images à 30 fps avec un `Math.ceil` : chaque scène dérivait
// jusqu'à 33 ms contre son propre audio, et ces millisecondes s'additionnaient.
// ---------------------------------------------------------------------------

/** Fréquence de sortie du rendu. N'intervient plus dans aucun calcul de durée. */
export const FPS = 30;

/**
 * Plancher du temps passé à l'écran, au cas où une piste audio revient très
 * courte. À ne pas confondre avec `MIN_SCENE_SECONDS` de `./service`, qui
 * borne la durée *estimée* depuis le texte avant que l'audio existe.
 */
export const MIN_SCENE_ON_SCREEN_SECONDS = 1;

/** Durée d'une transition qui n'en déclare pas d'autre. */
export const DEFAULT_TRANSITION_SECONDS = 0.5;

/**
 * Silence maintenu après la fin de la narration, média toujours à l'écran,
 * pour que le spectateur digère avant la réplique suivante.
 *
 * Il doit durer plus longtemps que la transition la plus longue : le
 * chevauchement avec la scène suivante tombe alors entièrement dans ce
 * silence, et la voix d'une scène ne joue jamais par-dessus celle de la
 * suivante. Un test le vérifie — l'ancien contrat l'affirmait en commentaire
 * et le violait déjà, `particleDissolve` durant 40 images pour une pause de 30.
 */
export const POST_NARRATION_PAUSE_SECONDS = 1;

/**
 * Durée de chaque transition, en secondes.
 *
 * Table plutôt que `switch` : elle se parcourt, donc l'invariant « plus courte
 * que la pause » est vérifiable au lieu d'être promis.
 */
export const TRANSITION_DURATIONS: Record<Transition, number> = {
  none: 0,
  fade: DEFAULT_TRANSITION_SECONDS,
  black: 0.85,
  // Les poussées sont courtes : un mouvement plein cadre qui s'attarde donne
  // le mal de mer, là où un fondu peut respirer.
  'push-left': 0.5,
  'push-right': 0.5,
  'push-up': 0.5,
  'zoom-through': 0.55,
  'zoom-out': 0.55,
  squeeze: 0.45,
  'domain-warp': 0.9,
  'ridged-burn': 0.9,
  'whip-pan': 0.65,
  'sdf-iris': 0.65,
  'ripple-waves': 0.8,
  'gravitational-lens': 0.8,
  'cinematic-zoom': 0.6,
  'chromatic-split': 0.4,
  glitch: 0.3,
  'swirl-vortex': 0.8,
  'thermal-distortion': 0.7,
  'flash-through-white': 0.35,
  'cross-warp-morph': 0.9,
  'light-leak': 0.6,
};

/** Arrondi à la milliseconde : au-delà, ce n'est que du bruit de flottant. */
function ms(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

export function transitionDurationSeconds(transition?: string): number {
  if (transition && transition in TRANSITION_DURATIONS) {
    return TRANSITION_DURATIONS[transition as Transition];
  }
  return DEFAULT_TRANSITION_SECONDS;
}

export function sceneDurationSeconds(scene: {
  durationInSeconds?: number;
  card?: unknown;
}): number {
  const narration = scene.durationInSeconds ?? 2;
  // Une carte de fin n'a ni voix ni son : rien à digérer.
  const pause = scene.card ? 0 : POST_NARRATION_PAUSE_SECONDS;
  return ms(Math.max(MIN_SCENE_ON_SCREEN_SECONDS, narration + pause));
}

type TimedScene = {
  durationInSeconds?: number;
  card?: unknown;
  effects?: { transition?: string };
};

/**
 * Instant de départ de chaque scène sur la timeline.
 *
 * C'est ce que Hyperframes attend : des positions absolues, pas des durées
 * enchaînées. Les transitions chevauchent leur voisine de gauche, donc chaque
 * scène recule de la durée de sa propre transition entrante.
 */
export function sceneStartTimes(scenes: TimedScene[]): number[] {
  const starts: number[] = [];
  let cursor = 0;
  scenes.forEach((scene, index) => {
    if (index > 0) {
      cursor -= transitionDurationSeconds(scene.effects?.transition ?? 'fade');
    }
    starts.push(ms(Math.max(0, cursor)));
    cursor = Math.max(0, cursor) + sceneDurationSeconds(scene);
  });
  return starts;
}

/** Durée totale de la composition. */
export function totalDurationSeconds(scenes: TimedScene[]): number {
  if (scenes.length === 0) return MIN_SCENE_ON_SCREEN_SECONDS;
  const starts = sceneStartTimes(scenes);
  const last = scenes.length - 1;
  return ms(
    Math.max(MIN_SCENE_ON_SCREEN_SECONDS, starts[last] + sceneDurationSeconds(scenes[last]))
  );
}

/**
 * Hauteur de la trame, en pixels, pour chaque résolution vendue.
 *
 * Multiples de 16 des deux côtés, et ce n'est pas de la coquetterie : les
 * modèles image de Workers AI ramènent toute dimension au multiple de 16
 * inférieur. Demander le 854 du 480p canonique renvoie une image de 848 de
 * large, donc 6 px de décalage avec la trame — soit un léger étirement sur
 * chaque plan. On aligne la trame sur ce que le modèle sait produire.
 */
const FRAME_SIZES: Record<Resolution, { long: number; short: number }> = {
  '480p': { long: 848, short: 480 },
  '720p': { long: 1280, short: 720 },
};

/**
 * Taille de la trame de sortie.
 *
 * Dépend de la résolution **et** du ratio. Elle ne dépendait que du ratio,
 * et rendait donc tout en 1920×1080 : un client qui payait le 480p — un
 * crédit la seconde — recevait un fichier 1080p, et le palier 720p facturé
 * trois fois plus n'existait qu'à l'affichage. L'essai gratuit bridé en 480p
 * livrait lui aussi du 1080p.
 */
export function dimensionsFor(
  ratio: Ratio,
  resolution: Resolution
): { width: number; height: number } {
  const { long, short } = FRAME_SIZES[resolution];
  return ratio === '9:16'
    ? { width: short, height: long }
    : { width: long, height: short };
}

// ---------------------------------------------------------------------------
// Sérialisation
// ---------------------------------------------------------------------------

export type HyperframesScene = {
  id: number;
  narration: string;
  subtitle?: string;
  mediaPath?: string;
  audioPath?: string;
  /** Position absolue sur la timeline — c'est le `data-start` de Hyperframes. */
  startInSeconds: number;
  /** Temps total à l'écran, silence de fin compris : le `data-duration`. */
  durationInSeconds: number;
  /**
   * Longueur de l'audio seul, sans le silence. La voix off s'arrête là, alors
   * que l'image reste. Les deux étaient confondus dans l'ancien contrat.
   */
  narrationSeconds: number;
  words?: WordTiming[];
} & SceneRender;

export type HyperframesStoryboard = {
  title: string;
  ratio: Ratio;
  voice?: string;
  subtitles: boolean;
  subtitleStyle: SubtitleStyle;
  music?: string;
  /** Secondes où la musique frappe, depuis son propre début. */
  musicImpacts?: number[];
  /** Longueur du morceau, pour retrouver ses pics quand il boucle. */
  musicDurationS?: number;
  musicVolume: number;
  sfxVolume: number;
  /** Durée totale, calculée une fois ici pour que personne ne la recalcule. */
  durationInSeconds: number;
  fps: number;
  width: number;
  height: number;
  scenes: HyperframesScene[];
};

/**
 * Transforme les lignes en exactement le JSON que consomme la composition.
 *
 * Chemins : pipevideo résout `mediaPath` et `audioPath` contre `public/`.
 * Ici ce sont ce que la couche de stockage remet — URLs R2 signées en
 * production, que le navigateur de rendu accepte comme sources absolues. Le
 * résolveur
 * d'assets de la composition est le seul endroit qui doit connaître la
 * différence.
 */
export function toHyperframesStoryboard(
  video: Pick<
    Video,
    | 'title'
    | 'ratio'
    | 'resolution'
    | 'voice'
    | 'subtitles'
    | 'subtitleStyle'
    | 'musicUrl'
    | 'musicVolume'
    | 'sfxVolume'
  >,
  shots: Shot[],
  {
    fallbackVoice,
    music,
  }: {
    fallbackVoice?: string | null;
    /**
     * Les pics du morceau et sa longueur, lus dans `sound_assets`.
     *
     * Optionnels parce que la vidéo ne stocke qu'une URL de musique : ses
     * métadonnées vivent dans le catalogue, et c'est l'appelant qui les
     * apporte. Sans elles, `onBeat` reste sans effet plutôt que de deviner.
     */
    music?: { impacts?: number[]; durationS?: number | null } | null;
  } = {}
): HyperframesStoryboard {
  const parsed = shots.map((shot) => {
    const render = sceneRenderSchema.safeParse(shot.render ?? {});
    return {
      shot,
      render: render.success ? render.data : {},
      durationInSeconds: shot.durationS,
      card: render.success ? render.data.card : undefined,
      effects: render.success ? render.data.effects : undefined,
    };
  });

  const starts = sceneStartTimes(parsed);
  const { width, height } = dimensionsFor(video.ratio, video.resolution);

  return {
    title: video.title,
    ratio: video.ratio,
    voice: video.voice ?? fallbackVoice ?? undefined,
    subtitles: video.subtitles,
    subtitleStyle: video.subtitleStyle,
    music: video.musicUrl ?? undefined,
    musicImpacts: music?.impacts?.length ? music.impacts : undefined,
    musicDurationS: music?.durationS ?? undefined,
    musicVolume: video.musicVolume,
    sfxVolume: video.sfxVolume,
    durationInSeconds: totalDurationSeconds(parsed),
    fps: FPS,
    width,
    height,
    scenes: parsed.map((entry, index) => {
      const { shot } = entry;
      const words = z.array(wordTimingSchema).safeParse(shot.words ?? []);

      return {
        // Les ids de scène sont positionnels : la composition ordonne dessus,
        // et le `order` stocké est ce que l'utilisateur a réarrangé.
        id: index + 1,
        narration: shot.narration ?? '',
        subtitle: shot.subtitle ?? undefined,
        mediaPath: shot.assetUrl ?? undefined,
        audioPath: shot.audioUrl ?? undefined,
        startInSeconds: starts[index],
        durationInSeconds: sceneDurationSeconds(entry),
        narrationSeconds: shot.durationS,
        words: words.success && words.data.length > 0 ? words.data : undefined,
        ...entry.render,
      };
    }),
  };
}
