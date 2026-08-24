import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantDb } from '@/lib/db/tenant-db';
import { shots, type Pipeline, type Shot, type Video } from '@/lib/db/schema';
import {
  estimateVideo,
  getBalance,
  validateAndChargeVideo,
} from '@/lib/credits';
import { getProject } from '@/lib/projects';
import { VideoError, assertDraft, getVideo } from '@/lib/videos';
import {
  keepKnownSounds,
  listSounds,
  renderSoundCatalogue,
  type SoundChoice,
} from '@/lib/sounds';
import {
  LlmError,
  createDeepSeekClient,
  type ChatMessage,
  type JsonCompleter,
} from '@/lib/llm/deepseek';
import { sceneEffectsSchema, sceneSoundSchema } from './render';

/**
 * Storyboard — the editable plan of a video.
 *
 * The order of the pipeline is what makes this file make sense:
 *
 *   1. the model writes the NARRATION of each scene, plus a visual prompt
 *   2. the voice-over is generated, and its real length becomes the duration
 *   3. that duration is what the video is priced on, exactly
 *   4. only then are the expensive visuals generated
 *
 * A duration is therefore never authored. Before the voice-over exists it is
 * *estimated* from the text so the user sees an order of magnitude; after, it
 * is *measured*. Validation refuses to charge anything that is still an
 * estimate — see `validateStoryboard`.
 */

/** A guard against a model that decides a video needs eighty scenes. */
export const MAX_SHOTS = 30;
export const DEFAULT_TARGET_SECONDS = 60;
export const MIN_SCENE_SECONDS = 1;
export const MAX_SCENE_SECONDS = 30;

/**
 * Speaking rate used to estimate a duration before the audio exists.
 *
 * Calibrated on measured voice-overs from the existing pipeline: 69 characters
 * for 5.28s, 64 for 4.82s, 104 for 6.79s — 13.1, 13.3 and 15.3 characters per
 * second. The estimate is deliberately a little fast, so the price shown before
 * the voice-over sits slightly under the measured one rather than over it.
 */
export const NARRATION_CHARS_PER_SECOND = 14;

export class StoryboardError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'StoryboardError';
    this.statusCode = statusCode;
  }
}

export type StoryboardView = {
  video: Video;
  shots: Shot[];
  creditsEstimated: number;
  balance: number;
  canAfford: boolean;
  /** True once every scene is priced on real audio rather than on text. */
  durationsMeasured: boolean;
};

export function estimateNarrationSeconds(narration: string): number {
  const characters = narration.trim().length;
  const seconds = characters / NARRATION_CHARS_PER_SECOND;
  return Math.min(
    MAX_SCENE_SECONDS,
    Math.max(MIN_SCENE_SECONDS, Math.round(seconds * 100) / 100)
  );
}

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  'You write storyboards for short videos assembled from AI-generated visuals',
  'and an AI voice-over.',
  '',
  'Answer with ONLY a JSON object of this exact shape:',
  '{"scenes":[{"narration":"...","type":"image","prompt":"...",',
  '"effects":{"zoom":"in","transition":"fade"},"sounds":[{"src":"..."}]}]}',
  '',
  'Rules:',
  '- `narration` is the line the voice reads out loud. Write it in the SAME',
  '  language as the theme. One or two spoken sentences per scene, no stage',
  '  directions, no scene numbers, no emoji, nothing unpronounceable.',
  '- `prompt` is the visual, in ENGLISH whatever the narration language: the',
  '  image and video models are trained on English captions. Describe one',
  '  continuous shot — subject, action, framing, light. No on-screen text.',
  '- Do NOT write any duration. The duration of a scene is the real length of',
  '  its voice-over, measured after the audio is generated.',
  '- Do not restate the project style in each prompt: it is applied separately.',
  '- `effects` is optional: zoom in/out/none, transition fade/slide/none/black/',
  '  wipe/zoomPunch/whipPan/glitchCut/particleDissolve, shake true/false,',
  '  cameraMotion orbit/dolly/pan/static.',
  '- `sounds` is optional and may ONLY contain `src` values copied verbatim',
  '  from the sound library given below. Never invent a path.',
  `- Never return more than ${MAX_SHOTS} scenes.`,
].join('\n');

const PIPELINE_INSTRUCTION: Record<Pipeline, string> = {
  image: 'Every scene must have type "image".',
  video: 'Every scene must have type "video".',
  mixed:
    'Choose per scene: "video" when movement carries the meaning, "image" when ' +
    'a still frame is enough — a still costs the customer four times less.',
};

export function buildStoryboardMessages({
  theme,
  stylePrompt,
  pipeline,
  targetSeconds = DEFAULT_TARGET_SECONDS,
  library = [],
}: {
  theme: string;
  stylePrompt?: string | null;
  pipeline: Pipeline;
  targetSeconds?: number;
  library?: SoundChoice[];
}): ChatMessage[] {
  const catalogue = renderSoundCatalogue(library);

  const user = [
    `Theme: ${theme}`,
    stylePrompt ? `Project style: ${stylePrompt}` : null,
    PIPELINE_INSTRUCTION[pipeline],
    `Spoken length: about ${targetSeconds} seconds of narration in total, ` +
      'split into scenes of one or two sentences.',
    catalogue ? `\nSound library — copy an "src" verbatim or omit it:\n${catalogue}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // The system message is first and never varies, so the provider's prompt
  // cache can hit on it across generations.
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

const llmSceneSchema = z.object({
  narration: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(2).max(2_000)
  ),
  type: z.enum(['image', 'video']),
  prompt: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(10).max(1_000)
  ),
  effects: sceneEffectsSchema.optional(),
  sounds: z.array(sceneSoundSchema.partial({ src: true })).optional(),
});

export const llmStoryboardSchema = z.object({
  scenes: z.array(llmSceneSchema).min(1),
});

export type NormalisedScene = {
  order: number;
  type: 'image' | 'video';
  prompt: string;
  narration: string;
  durationS: number;
  render: Record<string, unknown>;
};

/**
 * Turns what the model said into rows we are willing to store.
 *
 * Three things are taken out of the model's hands: the scene type (a video shot
 * in an image-only project would quadruple what the customer is charged), the
 * duration (measured, never authored), and the sound paths (a sound that does
 * not exist fails minutes later inside the renderer).
 */
export function normalizeStoryboard(
  data: unknown,
  pipeline: Pipeline,
  library: SoundChoice[] = []
): NormalisedScene[] {
  let parsed: z.infer<typeof llmStoryboardSchema>;
  try {
    parsed = llmStoryboardSchema.parse(data);
  } catch {
    throw new LlmError(
      'The model returned a storyboard in a shape we cannot use. Try again.'
    );
  }

  return parsed.scenes.slice(0, MAX_SHOTS).map((scene, index) => {
    const sounds = keepKnownSounds(scene.sounds, library);
    const render: Record<string, unknown> = {};
    if (scene.effects) render.effects = scene.effects;
    if (sounds.length > 0) render.sounds = sounds;

    return {
      order: index + 1,
      type: pipeline === 'mixed' ? scene.type : pipeline,
      prompt: scene.prompt,
      narration: scene.narration,
      durationS: estimateNarrationSeconds(scene.narration),
      render,
    };
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listShots(
  tdb: TenantDb,
  videoId: number
): Promise<Shot[]> {
  return await tdb.findMany(shots, eq(shots.videoId, videoId), {
    orderBy: [asc(shots.order), asc(shots.id)],
  });
}

async function view(tdb: TenantDb, video: Video): Promise<StoryboardView> {
  const storyboard = await listShots(tdb, video.id);
  const balance = await getBalance(tdb);

  return {
    video,
    shots: storyboard,
    creditsEstimated: video.creditsEstimated,
    balance,
    canAfford: balance >= video.creditsEstimated,
    durationsMeasured:
      storyboard.length > 0 &&
      storyboard.every((shot) => shot.durationSource === 'measured'),
  };
}

export async function getStoryboard(
  tdb: TenantDb,
  videoId: number
): Promise<StoryboardView> {
  return await view(tdb, await getVideo(tdb, videoId));
}

/**
 * Runs `mutate`, then re-prices the video in the same transaction: a storyboard
 * and the price shown next to it must never disagree.
 */
async function editStoryboard(
  tdb: TenantDb,
  videoId: number,
  mutate: (tx: TenantDb) => Promise<void>
): Promise<StoryboardView> {
  const video = await getVideo(tdb, videoId);
  assertDraft(video);

  const updated = await tdb.transaction(async (tx) => {
    await mutate(tx);
    const { video: fresh } = await estimateVideo(tx, videoId);
    return fresh;
  });

  return await view(tdb, updated);
}

/** Renumbers 1..n so a deletion never leaves a gap in the order. */
async function compactOrder(tx: TenantDb, videoId: number): Promise<void> {
  const remaining = await listShots(tx, videoId);

  await Promise.all(
    remaining.map((shot, index) =>
      shot.order === index + 1
        ? Promise.resolve([])
        : tx.update(
            shots,
            { order: index + 1, updatedAt: new Date() },
            eq(shots.id, shot.id)
          )
    )
  );
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generateStoryboard(
  tdb: TenantDb,
  videoId: number,
  {
    client,
    targetSeconds,
    library,
  }: {
    client?: JsonCompleter;
    targetSeconds?: number;
    library?: SoundChoice[];
  } = {}
): Promise<StoryboardView> {
  const video = await getVideo(tdb, videoId);
  assertDraft(video);

  const project = await getProject(tdb, video.projectId);
  const pipeline = video.pipelineOverride ?? project.defaultPipeline;
  const theme = video.theme?.trim() || video.title;
  const sounds = library ?? (await listSounds());

  const completion = await (client ?? createDeepSeekClient()).completeJson(
    buildStoryboardMessages({
      theme,
      stylePrompt: project.stylePrompt,
      pipeline,
      targetSeconds,
      library: sounds,
    })
  );

  const generated = normalizeStoryboard(completion.data, pipeline, sounds);

  return await editStoryboard(tdb, videoId, async (tx) => {
    // A regeneration replaces the draft wholesale — that is what the button
    // says it does, and half-merged storyboards would be worse than either.
    await tx.delete(shots, eq(shots.videoId, videoId));
    await tx.insert(
      shots,
      generated.map((scene) => ({
        videoId,
        order: scene.order,
        type: scene.type,
        prompt: scene.prompt,
        narration: scene.narration,
        durationS: scene.durationS,
        durationSource: 'estimated' as const,
        render: scene.render,
      }))
    );
  });
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * What a human may set on a scene. Notably absent: the duration. The user
 * rewrites the narration, and the duration follows — from the text while it is
 * an estimate, from the audio once the voice-over exists.
 */
export const shotInputSchema = z.object({
  type: z.enum(['image', 'video']),
  prompt: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(3, 'A scene needs a visual prompt.').max(1_000)
  ),
  narration: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(2, 'A scene needs a line to read.').max(2_000)
  ),
});

export const shotUpdateSchema = shotInputSchema.partial();

export type ShotInput = z.input<typeof shotInputSchema>;
export type ShotUpdate = z.input<typeof shotUpdateSchema>;

/** The shot must belong to *this* video, not merely to the same tenant. */
async function getShotOfVideo(
  tdb: TenantDb,
  videoId: number,
  shotId: number
): Promise<Shot> {
  const shot = Number.isInteger(shotId)
    ? await tdb.findFirst(
        shots,
        and(eq(shots.id, shotId), eq(shots.videoId, videoId))
      )
    : null;
  if (!shot) {
    throw new StoryboardError(`Shot ${shotId} not found in this video.`, 404);
  }
  return shot;
}

export async function addShot(
  tdb: TenantDb,
  videoId: number,
  input: ShotInput
): Promise<StoryboardView> {
  const data = shotInputSchema.parse(input);

  return await editStoryboard(tdb, videoId, async (tx) => {
    const existing = await tx.count(shots, eq(shots.videoId, videoId));
    if (existing >= MAX_SHOTS) {
      throw new StoryboardError(
        `A storyboard holds at most ${MAX_SHOTS} scenes.`,
        409
      );
    }
    await tx.insert(shots, {
      videoId,
      order: existing + 1,
      type: data.type,
      prompt: data.prompt,
      narration: data.narration,
      durationS: estimateNarrationSeconds(data.narration),
      durationSource: 'estimated',
    });
  });
}

/**
 * Rewriting the narration invalidates the voice-over: the audio no longer says
 * what the scene says, so the duration goes back to being an estimate and the
 * recorded track is dropped. Anything else would price the video on audio that
 * does not match its own script.
 */
export async function updateShot(
  tdb: TenantDb,
  videoId: number,
  shotId: number,
  input: ShotUpdate
): Promise<StoryboardView> {
  const data = shotUpdateSchema.parse(input);
  const shot = await getShotOfVideo(tdb, videoId, shotId);

  const patch: Record<string, unknown> = {};
  if (data.type !== undefined) patch.type = data.type;
  if (data.prompt !== undefined) patch.prompt = data.prompt;

  if (data.narration !== undefined && data.narration !== shot.narration) {
    patch.narration = data.narration;
    patch.durationS = estimateNarrationSeconds(data.narration);
    patch.durationSource = 'estimated';
    patch.audioUrl = null;
    patch.words = null;
  }

  return await editStoryboard(tdb, videoId, async (tx) => {
    if (Object.keys(patch).length === 0) return;
    await tx.update(
      shots,
      { ...patch, updatedAt: new Date() },
      eq(shots.id, shotId)
    );
  });
}

export async function deleteShot(
  tdb: TenantDb,
  videoId: number,
  shotId: number
): Promise<StoryboardView> {
  await getShotOfVideo(tdb, videoId, shotId);

  return await editStoryboard(tdb, videoId, async (tx) => {
    await tx.delete(shots, eq(shots.id, shotId));
    await compactOrder(tx, videoId);
  });
}

/**
 * Applies a new order.
 *
 * The submitted list must be exactly the video's scenes — no missing id, no
 * extra one, no duplicate. A partial list would silently renumber the rest.
 */
export async function reorderShots(
  tdb: TenantDb,
  videoId: number,
  orderedShotIds: number[]
): Promise<StoryboardView> {
  const video = await getVideo(tdb, videoId);
  assertDraft(video);

  const current = await tdb.findMany(shots, eq(shots.videoId, videoId));
  const currentIds = new Set(current.map((shot) => shot.id));
  const submitted = new Set(orderedShotIds);

  if (
    orderedShotIds.length !== current.length ||
    submitted.size !== orderedShotIds.length ||
    orderedShotIds.some((id) => !currentIds.has(id))
  ) {
    throw new StoryboardError(
      'The submitted order does not match this storyboard. Reload the page.',
      409
    );
  }

  return await editStoryboard(tdb, videoId, async (tx) => {
    await Promise.all(
      orderedShotIds.map((id, index) =>
        tx.update(
          shots,
          { order: index + 1, updatedAt: new Date() },
          eq(shots.id, id)
        )
      )
    );
  });
}

/** Moves one scene by one position. What the arrows in the kanban call. */
export async function moveShot(
  tdb: TenantDb,
  videoId: number,
  shotId: number,
  direction: 'up' | 'down'
): Promise<StoryboardView> {
  await getShotOfVideo(tdb, videoId, shotId);

  const current = await listShots(tdb, videoId);
  const index = current.findIndex((shot) => shot.id === shotId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= current.length) {
    // Already at the end of the list: nothing to do, and not an error.
    return await getStoryboard(tdb, videoId);
  }

  const ids = current.map((shot) => shot.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];

  return await reorderShots(tdb, videoId, ids);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a storyboard and charges it.
 *
 * Refuses while any scene is still priced on an estimate: the voice-over is
 * cheap and runs first precisely so the amount on the button is the amount
 * debited. Charging an estimate and reconciling afterwards would put correction
 * entries in a customer's ledger for no good reason.
 */
export async function validateStoryboard(
  tdb: TenantDb,
  videoId: number
): Promise<{ video: Video; charged: number; balance: number }> {
  const video = await getVideo(tdb, videoId);
  assertDraft(video);

  const storyboard = await listShots(tdb, videoId);
  if (storyboard.length === 0) {
    throw new StoryboardError('This storyboard has no scene to generate.', 409);
  }

  const unmeasured = storyboard.filter(
    (shot) => shot.durationSource !== 'measured'
  );
  if (unmeasured.length > 0) {
    throw new StoryboardError(
      `${unmeasured.length} scene${unmeasured.length > 1 ? 's are' : ' is'} still ` +
        'priced on an estimate. Generate the voice-over first — the exact price ' +
        'is measured on the audio.',
      409
    );
  }

  return await validateAndChargeVideo(tdb, videoId);
}

export { VideoError };
