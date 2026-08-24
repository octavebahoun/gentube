import { z } from 'zod';
import type { Ratio, Shot, Video } from '@/lib/db/schema';

/**
 * Le contrat de rendu — vérité partagée entre la base de données et la
 * composition Remotion.
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
  /** Rognage du fichier source, pour isoler un impact d'une prise plus longue. */
  trimStart: z.number().min(0).optional(),
  trimEnd: z.number().min(0).optional(),
});

export const TRANSITIONS = [
  'fade',
  'slide',
  'none',
  'black',
  'wipe',
  'zoomPunch',
  'whipPan',
  'glitchCut',
  'particleDissolve',
] as const;

/** Les mouvements caméra sont des directives pour le *prompt*, pas pour le renderer. */
export const CAMERA_MOTIONS = ['orbit', 'dolly', 'pan', 'static'] as const;

export const sceneEffectsSchema = z.object({
  zoom: z.enum(['in', 'out', 'none']).optional(),
  transition: z.enum(TRANSITIONS).optional(),
  shake: z.boolean().optional(),
  /** Directive : ce plan doit couper nettement avec la composition précédente. */
  matchCut: z.boolean().optional(),
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

export type WordTiming = z.infer<typeof wordTimingSchema>;
export type SceneSound = z.infer<typeof sceneSoundSchema>;
export type SceneRender = z.infer<typeof sceneRenderSchema>;

// ---------------------------------------------------------------------------
// Timing — une seule source de vérité, sinon les scènes sont tronquées
// ---------------------------------------------------------------------------

export const FPS = 30;

/** Plancher pour une scène, au cas où une piste audio revient très courte. */
export const MIN_SCENE_FRAMES = 30;

export const TRANSITION_FRAMES = 15;

/**
 * Silence maintenu après la fin de la narration, média toujours à l'écran,
 * pour que le spectateur digère avant la réplique suivante.
 *
 * Il doit durer plus longtemps que la transition la plus longue (26 frames
 * pour `black`) : le chevauchement avec la scène suivante tombe alors
 * entièrement dans ce silence, et la voix d'une scène ne joue jamais par-
 * dessus celle de la suivante.
 */
export const POST_NARRATION_PAUSE_FRAMES = 30;

export function transitionDurationFrames(transition?: string): number {
  switch (transition) {
    case 'none':
      return 0;
    case 'black':
      return 26;
    case 'wipe':
      return 20;
    case 'zoomPunch':
      return 18;
    case 'whipPan':
      return 20;
    case 'glitchCut':
      return 8;
    case 'particleDissolve':
      return 40;
    default:
      return TRANSITION_FRAMES; // fade, slide
  }
}

export function sceneDurationInFrames(
  scene: { durationInSeconds?: number; card?: unknown },
  fps: number = FPS
): number {
  const narrationFrames = Math.ceil((scene.durationInSeconds ?? 2) * fps);
  // Une carte de fin n'a ni voix ni son : rien à digérer.
  const pauseFrames = scene.card ? 0 : POST_NARRATION_PAUSE_FRAMES;
  return Math.max(MIN_SCENE_FRAMES, narrationFrames + pauseFrames);
}

/**
 * Durée totale de la composition. Les transitions chevauchent leurs voisines,
 * donc leur durée est soustraite — sinon le rendu dépasse son contenu.
 */
export function totalDurationInFrames(
  scenes: { durationInSeconds?: number; card?: unknown; effects?: { transition?: string } }[],
  fps: number = FPS
): number {
  const total = scenes.reduce((accumulated, scene, index) => {
    const overlap =
      index === 0 ? 0 : transitionDurationFrames(scene.effects?.transition ?? 'fade');
    return accumulated + sceneDurationInFrames(scene, fps) - overlap;
  }, 0);
  return Math.max(MIN_SCENE_FRAMES, total);
}

export function dimensionsFor(ratio: Ratio): { width: number; height: number } {
  return ratio === '9:16'
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
}

// ---------------------------------------------------------------------------
// Sérialisation
// ---------------------------------------------------------------------------

export type RemotionScene = {
  id: number;
  narration: string;
  subtitle?: string;
  mediaPath?: string;
  audioPath?: string;
  durationInSeconds?: number;
  words?: WordTiming[];
} & SceneRender;

export type RemotionStoryboard = {
  title: string;
  ratio: Ratio;
  voice?: string;
  subtitles: boolean;
  subtitleStyle: string;
  music?: string;
  musicVolume: number;
  sfxVolume: number;
  scenes: RemotionScene[];
};

/**
 * Transforme les lignes en exactement le JSON que consomme la composition.
 *
 * Chemins : pipevideo résout `mediaPath` et `audioPath` contre `public/`.
 * Ici ce sont ce que la couche de stockage remet — URLs R2 signées en
 * production, que Remotion accepte comme sources absolues. Le résolveur
 * d'assets de la composition est le seul endroit qui doit connaître la
 * différence.
 */
export function toRemotionStoryboard(
  video: Pick<
    Video,
    | 'title'
    | 'ratio'
    | 'voice'
    | 'subtitles'
    | 'subtitleStyle'
    | 'musicUrl'
    | 'musicVolume'
    | 'sfxVolume'
  >,
  shots: Shot[],
  { fallbackVoice }: { fallbackVoice?: string | null } = {}
): RemotionStoryboard {
  return {
    title: video.title,
    ratio: video.ratio,
    voice: video.voice ?? fallbackVoice ?? undefined,
    subtitles: video.subtitles,
    subtitleStyle: video.subtitleStyle,
    music: video.musicUrl ?? undefined,
    musicVolume: video.musicVolume,
    sfxVolume: video.sfxVolume,
    scenes: shots.map((shot, index) => {
      const render = sceneRenderSchema.safeParse(shot.render ?? {});
      const words = z.array(wordTimingSchema).safeParse(shot.words ?? []);

      return {
        // Les ids de scène sont positionnels : la composition ordonne dessus,
        // et le `order` stocké est ce que l'utilisateur a réarrangé.
        id: index + 1,
        narration: shot.narration ?? '',
        subtitle: shot.subtitle ?? undefined,
        mediaPath: shot.assetUrl ?? undefined,
        audioPath: shot.audioUrl ?? undefined,
        durationInSeconds: shot.durationS,
        words: words.success && words.data.length > 0 ? words.data : undefined,
        ...(render.success ? render.data : {}),
      };
    }),
  };
}
