import { z } from 'zod';
import type { Ratio, Shot, Video } from '@/lib/db/schema';

/**
 * The render contract — shared truth between the database and the Remotion
 * composition.
 *
 * This is a port of the storyboard schema already in production in the
 * pipevideo pipeline, kept field-for-field so the composition can be reused
 * without translation. Two consequences worth stating out loud:
 *
 *  - `durationInSeconds` and `words` are NEVER authored. They are the measured
 *    length of the voice-over and its word-by-word alignment, written by the
 *    voice-over step. A hand-written duration is a bug.
 *  - Everything in `sceneRenderSchema` is presentation. It lives in the `render`
 *    jsonb column precisely so that adding a transition or a title variant is a
 *    deploy, not a migration.
 */

export const wordTimingSchema = z.object({
  text: z.string(),
  /** Seconds from the start of the scene. */
  start: z.number(),
  duration: z.number(),
});

/** A sound played during a scene, on top of the voice: SFX, ambience, music. */
export const sceneSoundSchema = z.object({
  /** Key of a row in `sound_assets`, e.g. "sounds/sfx/pop.mp3". */
  src: z.string(),
  volume: z.number().min(0).max(1).optional(),
  startInSeconds: z.number().min(0).optional(),
  loop: z.boolean().optional(),
  fadeInSeconds: z.number().min(0).optional(),
  fadeOutSeconds: z.number().min(0).optional(),
  /** Trims the source file, to isolate one impact out of a longer take. */
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

/** Camera moves are directives for the *prompt*, not for the renderer. */
export const CAMERA_MOTIONS = ['orbit', 'dolly', 'pan', 'static'] as const;

export const sceneEffectsSchema = z.object({
  zoom: z.enum(['in', 'out', 'none']).optional(),
  transition: z.enum(TRANSITIONS).optional(),
  shake: z.boolean().optional(),
  /** Directive: this shot must cut cleanly from the previous composition. */
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
  /** Black screen with centred text: no voice, no media, no sound. */
  card: z
    .object({
      text: z.string(),
      subtext: z.string().optional(),
    })
    .optional(),
  /** Volume of the clip's own audio. 0 mutes it. */
  mediaVolume: z.number().min(0).max(1).optional(),
  /** Slows a short clip to fill the scene without a visible loop. */
  playbackRate: z.number().positive().optional(),
  showSubtitles: z.boolean().optional(),
  sounds: z.array(sceneSoundSchema).optional(),
});

export type WordTiming = z.infer<typeof wordTimingSchema>;
export type SceneSound = z.infer<typeof sceneSoundSchema>;
export type SceneRender = z.infer<typeof sceneRenderSchema>;

// ---------------------------------------------------------------------------
// Timing — one source of truth, or scenes get truncated
// ---------------------------------------------------------------------------

export const FPS = 30;

/** Floor for a scene, in case an audio track comes back very short. */
export const MIN_SCENE_FRAMES = 30;

export const TRANSITION_FRAMES = 15;

/**
 * Silence held after the narration ends, media still on screen, so the viewer
 * can digest before the next line.
 *
 * It must outlast the longest transition (26 frames for `black`): the overlap
 * with the next scene then falls entirely inside this silence, and one scene's
 * voice never plays over the next one's.
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
  // A closing card has neither voice nor sound: nothing to digest.
  const pauseFrames = scene.card ? 0 : POST_NARRATION_PAUSE_FRAMES;
  return Math.max(MIN_SCENE_FRAMES, narrationFrames + pauseFrames);
}

/**
 * Total length of the composition. Transitions overlap their neighbours, so
 * their duration is subtracted — otherwise the render runs past its content.
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
// Serialisation
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
 * Turns the rows into exactly the JSON the composition consumes.
 *
 * Paths: pipevideo resolves `mediaPath` and `audioPath` against `public/`.
 * Here they are whatever the storage layer hands over — signed R2 URLs in
 * production, which Remotion accepts as absolute sources. The composition's
 * asset resolver is the single place that has to know the difference.
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
        // Scene ids are positional: the composition orders on them, and the
        // stored `order` is what the user rearranged.
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
