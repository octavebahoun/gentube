import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { shots, videos, type Pipeline } from '@/lib/db/schema';
import { createProject } from '@/lib/projects';
import { createVideo } from '@/lib/videos';
import { LlmError, type JsonCompleter } from '@/lib/llm/deepseek';
import type { SoundChoice } from '@/lib/sounds';
import type { TenantDb } from '@/lib/db/tenant-db';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import {
  MAX_SHOTS,
  NARRATION_CHARS_PER_SECOND,
  StoryboardError,
  addShot,
  buildStoryboardMessages,
  deleteShot,
  estimateNarrationSeconds,
  generateStoryboard,
  getStoryboard,
  moveShot,
  normalizeStoryboard,
  reorderShots,
  updateShot,
  validateStoryboard,
} from './service';

afterAll(async () => {
  await closeDb();
});

const LIBRARY: SoundChoice[] = [
  {
    src: 'sounds/sfx/pop.mp3',
    kind: 'sfx',
    mood: 'sec, dynamique',
    loopable: false,
    durationS: 2.8,
    impacts: [0.1],
    usage: 'apparition d’un chiffre à l’écran',
  },
  {
    src: 'sounds/ambient/arcade-room.mp3',
    kind: 'ambient',
    mood: 'rétro, bruyant',
    loopable: true,
    durationS: 33,
    impacts: [5.6, 10.38],
    usage: 'ambiance de salle d’arcade',
  },
];

/** Une narration dont la durée estimée est exactement `seconds`. */
function line(seconds: number, label = 'a'): string {
  return label.repeat(seconds * NARRATION_CHARS_PER_SECOND);
}

function answering(data: unknown): JsonCompleter {
  return {
    async completeJson() {
      return {
        data,
        usage: { promptTokens: 10, completionTokens: 20, reasoningTokens: 5 },
      };
    },
  };
}

function scenesOf(
  count: number,
  { type = 'video', seconds = 5 }: { type?: string; seconds?: number } = {}
) {
  return {
    scenes: Array.from({ length: count }, (_, index) => ({
      narration: line(seconds, String.fromCharCode(97 + (index % 26))),
      type,
      prompt: `Shot number ${index + 1}, wide angle, golden light.`,
    })),
  };
}

async function draftVideo(
  tdb: TenantDb,
  {
    defaultPipeline = 'mixed' as Pipeline,
    pipelineOverride,
    theme,
    stylePrompt,
    resolution,
  }: {
    defaultPipeline?: Pipeline;
    pipelineOverride?: string;
    theme?: string;
    stylePrompt?: string;
    resolution?: '480p' | '720p';
  } = {}
) {
  const project = await createProject(tdb, {
    name: 'Docs',
    defaultPipeline,
    stylePrompt,
  });
  const video = await createVideo(tdb, {
    projectId: project.id,
    title: 'Les Amazones',
    theme,
    resolution,
    pipelineOverride,
  });
  return { project, video };
}

/** Marque chaque scène comme doublée, comme le ferait l'étape voix off. */
async function measure(tdb: TenantDb, videoId: number) {
  const rows = await tdb.findMany(shots, eq(shots.videoId, videoId));
  for (const shot of rows) {
    await tdb.update(
      shots,
      { durationSource: 'measured', audioUrl: `1/videos/${videoId}/scene-${shot.id}.mp3` },
      eq(shots.id, shot.id)
    );
  }
}

describe('estimating a duration from the text', () => {
  it('reads the duration off the narration, not off the model', () => {
    // Calibré sur des voix off mesurées : ~14 caractères par seconde.
    expect(estimateNarrationSeconds(line(5))).toBe(5);
    expect(estimateNarrationSeconds(line(2))).toBe(2);
  });

  it('never returns zero, and never runs away', () => {
    expect(estimateNarrationSeconds('Oui.')).toBeGreaterThanOrEqual(1);
    expect(estimateNarrationSeconds('x'.repeat(10_000))).toBeLessThanOrEqual(30);
  });
});

describe('storyboard prompting', () => {
  it('asks for narration and forbids durations', () => {
    const messages = buildStoryboardMessages({
      theme: 'Amazones du Dahomey',
      stylePrompt: 'Cinematic documentary',
      pipeline: 'mixed',
      targetSeconds: 90,
      library: LIBRARY,
    });

    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('narration');
    // La durée est mesurée sur l'audio ; le modèle ne doit pas en inventer une.
    expect(messages[0].content).toContain('Do NOT write any duration');
    // Narration dans la langue du thème, visuels en anglais.
    expect(messages[0].content).toContain('SAME');
    expect(messages[0].content).toContain('ENGLISH');

    expect(messages[1].content).toContain('Amazones du Dahomey');
    expect(messages[1].content).toContain('Cinematic documentary');
    expect(messages[1].content).toContain('90 seconds');
    // Le catalogue voyage avec la requête, sinon le modèle invente des chemins.
    expect(messages[1].content).toContain('sounds/sfx/pop.mp3');
  });

  it('omits the sound section when the library is empty', () => {
    const [, user] = buildStoryboardMessages({ theme: 't', pipeline: 'image' });
    expect(user.content).not.toContain('Sound library');
  });
});

describe('normalising what the model returns', () => {
  it('stores the narration and prices it from the text', () => {
    const normalised = normalizeStoryboard(
      {
        scenes: [
          { narration: line(4), type: 'video', prompt: 'Warriors at dawn, wide' },
          { narration: line(6), type: 'image', prompt: 'Palace walls, still frame' },
        ],
      },
      'mixed'
    );

    expect(normalised.map((scene) => scene.order)).toEqual([1, 2]);
    expect(normalised.map((scene) => scene.durationS)).toEqual([4, 6]);
    expect(normalised[0].narration).toHaveLength(4 * NARRATION_CHARS_PER_SECOND);
  });

  it('forces the project pipeline rather than trusting the answer', () => {
    const answer = {
      scenes: [
        { narration: line(3), type: 'video', prompt: 'Warriors in formation at dawn' },
        { narration: line(3), type: 'image', prompt: 'The palace of Abomey, still' },
      ],
    };

    // Une scène vidéo dans un projet image-only quadruplerait la facture.
    expect(normalizeStoryboard(answer, 'image').map((s) => s.type)).toEqual([
      'image',
      'image',
    ]);
    expect(normalizeStoryboard(answer, 'mixed').map((s) => s.type)).toEqual([
      'video',
      'image',
    ]);
  });

  it('keeps the effects and drops sounds that do not exist', () => {
    const normalised = normalizeStoryboard(
      {
        scenes: [
          {
            narration: line(3),
            type: 'video',
            prompt: 'Warriors in formation at dawn',
            effects: { zoom: 'in', transition: 'whip-pan', cameraMotion: 'dolly' },
            sounds: [
              { src: 'sounds/sfx/pop.mp3', startInSeconds: 0.5 },
              // Inventé par le modèle : échouerait quelques minutes plus tard dans Lambda.
              { src: 'sounds/sfx/imaginary-boom.mp3' },
            ],
          },
        ],
      },
      'video',
      LIBRARY
    );

    expect(normalised[0].render).toEqual({
      effects: { zoom: 'in', transition: 'whip-pan', cameraMotion: 'dolly' },
      sounds: [{ src: 'sounds/sfx/pop.mp3', startInSeconds: 0.5 }],
    });
  });

  it('caps a runaway storyboard', () => {
    expect(normalizeStoryboard(scenesOf(MAX_SHOTS + 10), 'video')).toHaveLength(
      MAX_SHOTS
    );
  });

  it('refuses an answer it cannot use', () => {
    for (const answer of [
      {},
      { scenes: [] },
      // Pas de narration : rien à lire, donc rien à mesurer.
      { scenes: [{ type: 'video', prompt: 'A long enough visual prompt' }] },
      { scenes: [{ narration: line(3), type: 'audio', prompt: 'A long enough prompt' }] },
      { scenes: [{ narration: line(3), type: 'video', prompt: 'short' }] },
      'not an object',
    ]) {
      expect(() => normalizeStoryboard(answer, 'mixed')).toThrow(LlmError);
    }
  });
});

describe('storyboard generation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('stores the scenes and prices them as estimates', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video } = await draftVideo(tdb);

    const result = await generateStoryboard(tdb, video.id, {
      client: answering(scenesOf(3, { seconds: 5 })),
      library: LIBRARY,
    });

    expect(result.shots).toHaveLength(3);
    expect(result.shots.every((shot) => shot.narration !== null)).toBe(true);
    expect(result.shots.map((shot) => shot.durationSource)).toEqual([
      'estimated',
      'estimated',
      'estimated',
    ]);
    // 3 scenes x 5s at 480p = 15 credits, still an estimate.
    expect(result.creditsEstimated).toBe(15);
    expect(result.durationsMeasured).toBe(false);
    expect(result.video.creditsConsumed).toBe(0);
  });

  it('prices 720p four times as much', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video } = await draftVideo(tdb, { resolution: '720p' });

    const result = await generateStoryboard(tdb, video.id, {
      client: answering(scenesOf(2, { seconds: 5 })),
      library: [],
    });

    expect(result.creditsEstimated).toBe(40);
  });

  it('replaces the previous draft wholesale', async () => {
    const tdb = await createTenant('Alpha');
    const { video } = await draftVideo(tdb);

    await generateStoryboard(tdb, video.id, { client: answering(scenesOf(5)), library: [] });
    const again = await generateStoryboard(tdb, video.id, {
      client: answering(scenesOf(2)),
      library: [],
    });

    expect(again.shots).toHaveLength(2);
    expect(await tdb.count(shots)).toBe(2);
    expect(again.shots.map((shot) => shot.order)).toEqual([1, 2]);
  });

  it('asks about the theme, and falls back to the title', async () => {
    const tdb = await createTenant('Alpha');
    const { video } = await draftVideo(tdb, { theme: 'The women warriors' });

    const asked: string[] = [];
    const spy: JsonCompleter = {
      async completeJson(messages) {
        asked.push(messages[1].content);
        return {
          data: scenesOf(1),
          usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
        };
      },
    };

    await generateStoryboard(tdb, video.id, { client: spy, library: [] });
    expect(asked[0]).toContain('The women warriors');

    const { video: untyped } = await draftVideo(tdb);
    await generateStoryboard(tdb, untyped.id, { client: spy, library: [] });
    expect(asked[1]).toContain('Les Amazones');
  });

  it('refuses to regenerate anything that left draft', async () => {
    const tdb = await createTenant('Alpha');
    const { video } = await draftVideo(tdb);
    await generateStoryboard(tdb, video.id, { client: answering(scenesOf(2)), library: [] });
    await tdb.update(videos, { status: 'validated' }, eq(videos.id, video.id));

    await expect(
      generateStoryboard(tdb, video.id, { client: answering(scenesOf(9)), library: [] })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await tdb.count(shots)).toBe(2);
  });

  it('leaves the storyboard untouched when the model fails', async () => {
    const tdb = await createTenant('Alpha');
    const { video } = await draftVideo(tdb);
    await generateStoryboard(tdb, video.id, { client: answering(scenesOf(3)), library: [] });

    const broken: JsonCompleter = {
      async completeJson() {
        throw new LlmError('DeepSeek returned an empty answer.');
      },
    };

    await expect(
      generateStoryboard(tdb, video.id, { client: broken, library: [] })
    ).rejects.toThrow(LlmError);
    expect(await tdb.count(shots)).toBe(3);
  });
});

describe('storyboard editing', () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function withScenes(count = 3, seconds = 5) {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video } = await draftVideo(tdb);
    const board = await generateStoryboard(tdb, video.id, {
      client: answering(scenesOf(count, { seconds })),
      library: [],
    });
    return { tdb, video, board };
  }

  it('adds a scene at the end, priced from its narration', async () => {
    const { tdb, video } = await withScenes(2);

    const board = await addShot(tdb, video.id, {
      type: 'image',
      prompt: 'Closing still of the palace at dusk',
      narration: line(4),
    });

    expect(board.shots).toHaveLength(3);
    expect(board.shots[2]).toMatchObject({
      order: 3,
      type: 'image',
      durationS: 4,
      durationSource: 'estimated',
    });
    expect(board.creditsEstimated).toBe(5 + 5 + 4);
  });

  it('refuses a scene with nothing to read', async () => {
    const { tdb, video } = await withScenes(1);

    await expect(
      addShot(tdb, video.id, {
        type: 'video',
        prompt: 'A perfectly fine visual prompt',
        narration: '',
      })
    ).rejects.toThrow();
    await expect(
      addShot(tdb, video.id, { type: 'video', prompt: 'no', narration: line(3) })
    ).rejects.toThrow();
  });

  it('stops at the maximum number of scenes', async () => {
    const { tdb, video } = await withScenes(MAX_SHOTS, 1);

    await expect(
      addShot(tdb, video.id, {
        type: 'video',
        prompt: 'One scene too many for this board',
        narration: line(2),
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('drops the recorded voice when the line changes', async () => {
    const { tdb, video, board } = await withScenes(2);
    await measure(tdb, video.id);
    expect((await getStoryboard(tdb, video.id)).durationsMeasured).toBe(true);

    const updated = await updateShot(tdb, video.id, board.shots[0].id, {
      narration: line(8),
    });

    // L'audio ne dit plus ce que dit la scène : retour à une estimation.
    expect(updated.shots[0]).toMatchObject({
      durationS: 8,
      durationSource: 'estimated',
      audioUrl: null,
      words: null,
    });
    expect(updated.creditsEstimated).toBe(8 + 5);
    expect(updated.durationsMeasured).toBe(false);
  });

  it('keeps the voice when only the visual changes', async () => {
    const { tdb, video, board } = await withScenes(2);
    await measure(tdb, video.id);

    const updated = await updateShot(tdb, video.id, board.shots[0].id, {
      type: 'image',
      prompt: 'A different visual entirely',
    });

    expect(updated.shots[0]).toMatchObject({
      type: 'image',
      durationSource: 'measured',
    });
    expect(updated.shots[0].audioUrl).not.toBeNull();
    expect(updated.durationsMeasured).toBe(true);
  });

  it('deletes a scene and closes the gap in the order', async () => {
    const { tdb, video, board } = await withScenes(3);

    const after = await deleteShot(tdb, video.id, board.shots[1].id);

    expect(after.shots.map((shot) => shot.order)).toEqual([1, 2]);
    expect(after.creditsEstimated).toBe(10);
  });

  it('reorders on an exact list, and refuses anything else', async () => {
    const { tdb, video, board } = await withScenes(3);
    const [a, b, c] = board.shots.map((shot) => shot.id);

    const reordered = await reorderShots(tdb, video.id, [c, a, b]);
    expect(reordered.shots.map((shot) => shot.id)).toEqual([c, a, b]);

    for (const bad of [[c, a], [a, b, c, 9_999], [a, a, b]]) {
      await expect(reorderShots(tdb, video.id, bad)).rejects.toMatchObject({
        statusCode: 409,
      });
    }
  });

  it('moves a scene one step, and does nothing at the ends', async () => {
    const { tdb, video, board } = await withScenes(3);
    const [a, b, c] = board.shots.map((shot) => shot.id);

    expect(
      (await moveShot(tdb, video.id, b, 'up')).shots.map((shot) => shot.id)
    ).toEqual([b, a, c]);
    expect(
      (await moveShot(tdb, video.id, b, 'up')).shots.map((shot) => shot.id)
    ).toEqual([b, a, c]);
  });

  it('refuses every edit once the video left draft', async () => {
    const { tdb, video, board } = await withScenes(2);
    const shotId = board.shots[0].id;
    await tdb.update(videos, { status: 'validated' }, eq(videos.id, video.id));

    for (const call of [
      () => addShot(tdb, video.id, { type: 'image', prompt: 'A new still shot', narration: line(2) }),
      () => updateShot(tdb, video.id, shotId, { narration: line(3) }),
      () => deleteShot(tdb, video.id, shotId),
    ]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 409 });
    }
  });
});

describe('validation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('refuses to charge a price that is still an estimate', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video } = await draftVideo(tdb);
    await generateStoryboard(tdb, video.id, { client: answering(scenesOf(3)), library: [] });

    // Le prix exact est mesuré sur l'audio ; facturer avant mettrait des
    // écritures de correction dans le grand livre d'un client.
    await expect(validateStoryboard(tdb, video.id)).rejects.toThrow(
      /voice-over first/
    );
    expect((await getStoryboard(tdb, video.id)).video.status).toBe('draft');
    expect(await tdb.getTenant().then((t) => t!.creditsBalance)).toBe(1_000);
  });

  it('charges the measured price and leaves draft', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video } = await draftVideo(tdb);
    await generateStoryboard(tdb, video.id, {
      client: answering(scenesOf(3, { seconds: 5 })),
      library: [],
    });
    await measure(tdb, video.id);

    const { charged, balance } = await validateStoryboard(tdb, video.id);

    expect(charged).toBe(15);
    expect(balance).toBe(985);
    expect((await getStoryboard(tdb, video.id)).video.status).toBe('validated');
  });

  it('refuses an empty storyboard', async () => {
    const tdb = await createTenant('Alpha', { credits: 100 });
    const { video } = await draftVideo(tdb);

    await expect(validateStoryboard(tdb, video.id)).rejects.toThrow(
      StoryboardError
    );
  });
});

describe('storyboard isolation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('refuses a scene that belongs to another video of the same tenant', async () => {
    const tdb = await createTenant('Alpha');
    const { video: first } = await draftVideo(tdb);
    const { video: second } = await draftVideo(tdb);
    const board = await generateStoryboard(tdb, first.id, {
      client: answering(scenesOf(2)),
      library: [],
    });

    await expect(
      updateShot(tdb, second.id, board.shots[0].id, { narration: line(3) })
    ).rejects.toThrow(StoryboardError);
    await expect(
      deleteShot(tdb, second.id, board.shots[0].id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('hides another tenant storyboard entirely', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const { video } = await draftVideo(alpha);
    const board = await generateStoryboard(alpha, video.id, {
      client: answering(scenesOf(2)),
      library: [],
    });

    await expect(getStoryboard(beta, video.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      generateStoryboard(beta, video.id, { client: answering(scenesOf(1)), library: [] })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      deleteShot(beta, video.id, board.shots[0].id)
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(validateStoryboard(beta, video.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(await beta.count(shots)).toBe(0);
  });
});
