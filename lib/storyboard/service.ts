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
import { getEntitlements } from '@/lib/billing/entitlements';
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
import { TRANSITIONS, sceneEffectsSchema, sceneSoundSchema } from './render';

/**
 * Storyboard — le plan éditable d'une vidéo.
 *
 * L'ordre du pipeline est ce qui donne son sens à ce fichier :
 *
 *   1. le modèle écrit la NARRATION de chaque scène, plus un prompt visuel
 *   2. la voix off est générée, et sa longueur réelle devient la durée
 *   3. cette durée est ce sur quoi la vidéo est facturée, au prix exact
 *   4. seulement ensuite les visuels coûteux sont générés
 *
 * Une durée n'est donc jamais rédigée à la main. Avant l'existence de la voix
 * off elle est *estimée* à partir du texte pour que l'utilisateur voie un ordre
 * de grandeur ; après, elle est *mesurée*. La validation refuse de facturer
 * tout ce qui reste une estimation — voir `validateStoryboard`.
 */

/** Un garde-fou contre un modèle qui déciderait qu'une vidéo demande quatre-vingts scènes. */
export const MAX_SHOTS = 30;
export const DEFAULT_TARGET_SECONDS = 60;
export const MIN_SCENE_SECONDS = 1;
export const MAX_SCENE_SECONDS = 30;

/**
 * Débit de parole utilisé pour estimer une durée avant l'existence de l'audio.
 *
 * Calibré sur des voix off mesurées du pipeline existant : 69 caractères pour
 * 5,28 s, 64 pour 4,82 s, 104 pour 6,79 s — soit 13,1, 13,3 et 15,3
 * caractères par seconde. L'estimation est volontairement un peu rapide, pour
 * que le prix affiché avant la voix off se place légèrement sous le prix
 * mesuré plutôt qu'au-dessus.
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
  /** Vrai une fois que chaque scène est facturée sur de l'audio réel plutôt que sur du texte. */
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
  '- `effects` is optional: zoom in/out/none, shake true/false,',
  '  cameraMotion orbit/dolly/pan/static, and transition — one of:',
  `  ${TRANSITIONS.join('/')}.`,
  '  Pick by intent, not by variety. `fade` carries continuity, `black` marks',
  '  a chapter, `push-*` and `zoom-*` mean the story moved somewhere else, and',
  '  the named shaders are loud — at most two or three in a whole video.',
  '- `counter` is optional and turns the scene into a number that climbs:',
  '  { value, label, from?, prefix?, suffix?, decimals?, variant: count|ring }.',
  '  Such a scene needs NO `prompt` — it draws itself, so it costs nothing to',
  '  illustrate. Use it whenever the narration states a figure worth holding.',
  '- `sounds` is optional and may ONLY contain `src` values copied verbatim',
  '  from the sound library given below. Never invent a path.',
  `- Never return more than ${MAX_SHOTS} scenes.`,
].join('\n');

const PIPELINE_INSTRUCTION: Record<Pipeline, string> = {
  image: 'Every scene must have type "image".',
  video: 'Every scene must have type "video".',
  mixed:
    'Choose per scene: "video" when movement carries the meaning, "image" when ' +
    'a still frame is enough — a still costs the customer half as much.',
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

  // Le message système est en premier et ne varie jamais, pour que le cache
  // de prompt du fournisseur puisse le toucher d'une génération à l'autre.
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
 * Transforme ce que le modèle a dit en lignes que nous acceptons de stocker.
 *
 * Trois choses sont retirées des mains du modèle : le type de scène (un plan
 * vidéo dans un projet image-only quadruplerait ce que le client se voit
 * facturer), la durée (mesurée, jamais rédigée), et les chemins de sons (un
 * son inexistant échoue quelques minutes plus tard dans le renderer).
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
// Lecture
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
 * Exécute `mutate`, puis re-facture la vidéo dans la même transaction : un
 * storyboard et le prix affiché à côté ne doivent jamais être en désaccord.
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

/** Renumérote 1..n pour qu'une suppression ne laisse jamais de trou dans l'ordre. */
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
// Génération
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
    // Une régénération remplace le brouillon en bloc — c'est ce que le bouton
    // annonce faire, et des storyboards à moitié fusionnés seraient pire que
    // l'un ou l'autre.
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
// Édition
// ---------------------------------------------------------------------------

/**
 * Ce qu'un humain peut définir sur une scène. Notablement absent : la durée.
 * L'utilisateur réécrit la narration, et la durée suit — à partir du texte
 * tant que c'est une estimation, à partir de l'audio dès que la voix off
 * existe.
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

/** Le plan doit appartenir à *cette* vidéo, pas seulement au même tenant. */
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
 * Réécrire la narration invalide la voix off : l'audio ne dit plus ce que dit
 * la scène, donc la durée redevient une estimation et la piste enregistrée
 * est supprimée. Tout autre comportement facturerait la vidéo sur un audio
 * qui ne matche pas son propre script.
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
 * Applique un nouvel ordre.
 *
 * La liste soumise doit être exactement les scènes de la vidéo — pas d'id
 * manquant, pas d'id en plus, pas de doublon. Une liste partielle renuméroterait
 * silencieusement le reste.
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

/** Déplace une scène d'une position. Ce que les flèches du kanban appellent. */
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
    // Déjà en bout de liste : rien à faire, et pas une erreur.
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
 * Valide un storyboard et le facture.
 *
 * Refuse tant qu'une scène est encore facturée sur une estimation : la voix
 * off est bon marché et tourne en premier précisément pour que le montant sur
 * le bouton soit le montant débité. Facturer une estimation et réconcilier
 * ensuite mettrait des écritures de correction dans le grand livre d'un client
 * sans aucune bonne raison.
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

  const { watermark } = await getEntitlements(tdb);
  return await validateAndChargeVideo(tdb, videoId, { watermark });
}

export { VideoError };
