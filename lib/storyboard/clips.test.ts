import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { jobs, shots } from '@/lib/db/schema';
import { createProject } from '@/lib/projects';
import { createVideo } from '@/lib/videos';
import type { AssetStore } from '@/lib/storage';
import type { TenantDb } from '@/lib/db/tenant-db';
import type { JsonCompleter } from '@/lib/llm/deepseek';
import {
  ANIMATE_STEP,
  AnimationError,
  type AnimationRequest,
  type VideoAnimator,
} from '@/lib/video';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import {
  NARRATION_CHARS_PER_SECOND,
  generateStoryboard,
  validateStoryboard,
} from './service';
import { generateVoiceover } from './voiceover';
import { generateImages } from './images';
import { animationPrompt, submitClips } from './clips';

afterAll(async () => {
  await closeDb();
});

// La construction de l'URL de rappel en dépend, et le setup de test vide les
// variables des fournisseurs payants.
process.env.BASE_URL = 'https://gentube.test';

const line = (seconds: number, label = 'a') =>
  label.repeat(Math.round(seconds * NARRATION_CHARS_PER_SECOND));

function answering(types: ('image' | 'video')[]): JsonCompleter {
  return {
    async completeJson() {
      return {
        data: {
          scenes: types.map((type, index) => ({
            narration: line(5),
            type,
            prompt: `Visual prompt number ${index + 1}, wide angle`,
          })),
        },
        usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
      };
    },
  };
}

const voice = (durationS: number) => ({
  async synthesize(text: string) {
    return {
      audio: Buffer.from('mp3'),
      contentType: 'audio/mpeg',
      words: [{ text: text.slice(0, 4), start: 0, duration: durationS }],
      durationS,
    };
  },
});

function store() {
  const bytes = new Map<string, Buffer>();
  const assets: AssetStore = {
    async put(key, body) {
      bytes.set(key, body);
      return key;
    },
    async get(key) {
      const found = bytes.get(key);
      if (!found) throw new Error(`No such object: ${key}`);
      return found;
    },
    async signedUrl(key) {
      return `https://r2.test/${key}?signed`;
    },
  };
  return { assets, bytes };
}

function images() {
  return {
    async generate() {
      return {
        bytes: Buffer.from('jpeg'),
        contentType: 'image/jpeg',
        width: 848,
        height: 480,
      };
    },
  };
}

/** Un animateur qui note ce qu'on lui demande, et peut refuser la Nième scène. */
function animator({ failOnCall }: { failOnCall?: number } = {}) {
  const calls: AnimationRequest[] = [];
  const client: VideoAnimator = {
    async submit(request) {
      calls.push(request);
      if (failOnCall !== undefined && calls.length === failOnCall) {
        throw new AnimationError('Replicate 402: payment required', 402);
      }
      return {
        externalId: `pred_${calls.length}`,
        model: 'wan-video/wan-2.2-i2v-fast',
        costUsd: 0.05,
      };
    },
    async outcome() {
      return { status: 'pending' as const };
    },
  };
  return { client, calls };
}

/** Une vidéo validée dont les fixes sont déjà en place. */
async function readyForClips(
  tdb: TenantDb,
  types: ('image' | 'video')[],
  { durationS = 5 }: { durationS?: number } = {}
) {
  const project = await createProject(tdb, {
    name: 'Docs',
    defaultPipeline: 'mixed',
  });
  const video = await createVideo(tdb, {
    projectId: project.id,
    title: 'Les Amazones',
  });
  await generateStoryboard(tdb, video.id, {
    client: answering(types),
    library: [],
  });
  await generateVoiceover(tdb, video.id, {
    client: voice(durationS),
    store: store().assets,
  });
  await validateStoryboard(tdb, video.id);
  await generateImages(tdb, video.id, {
    client: images(),
    store: store().assets,
  });
  return video;
}

describe('submitting the clips', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('ne soumet que les plans animés', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const video = await readyForClips(tdb, ['image', 'video', 'image']);
    const { client, calls } = animator();

    const result = await submitClips(tdb, video.id, {
      animator: client,
      store: store().assets,
    });

    expect(result.submitted).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("passe l'image fixe signée et l'URL de rappel qui nomme le job", async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const video = await readyForClips(tdb, ['video']);
    const { client, calls } = animator();

    await submitClips(tdb, video.id, { animator: client, store: store().assets });

    const [job] = await tdb.findMany(jobs, eq(jobs.videoId, video.id));
    expect(calls[0].imageUrl).toMatch(/^https:\/\/r2\.test\/.+\?signed$/);
    expect(calls[0].webhookUrl).toBe(
      `https://gentube.test/api/webhooks/replicate?job=${job.id}`
    );
  });

  it('range la prédiction dans le job et met le plan en génération', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const video = await readyForClips(tdb, ['video']);
    const { client } = animator();

    await submitClips(tdb, video.id, { animator: client, store: store().assets });

    const [job] = await tdb.findMany(jobs, eq(jobs.videoId, video.id));
    expect(job.step).toBe(ANIMATE_STEP);
    expect(job.externalId).toBe('pred_1');
    expect(job.status).toBe('running');
    expect(job.payload).toMatchObject({ model: expect.any(String), costUsd: 0.05 });

    const [shot] = await tdb.findMany(shots, eq(shots.videoId, video.id));
    expect(shot.status).toBe('generating');
  });

  it('saute un plan déjà parti plutôt que de le repayer', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const video = await readyForClips(tdb, ['video']);
    const { client, calls } = animator();

    await submitClips(tdb, video.id, { animator: client, store: store().assets });
    const second = await submitClips(tdb, video.id, {
      animator: client,
      store: store().assets,
    });

    expect(second.submitted).toBe(0);
    expect(second.skipped).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('refuse une scène plus longue que ce que le modèle rend d\'un trait', async () => {
    // 9 s en 480p : Wan plafonne à 7,56 s et ralentir le clip se verrait.
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const video = await readyForClips(tdb, ['video'], { durationS: 9 });
    const { client, calls } = animator();

    await expect(
      submitClips(tdb, video.id, { animator: client, store: store().assets })
    ).rejects.toThrow(/cannot exceed/);
    expect(calls).toHaveLength(0);
  });

  it('laisse le job échoué, jamais en attente, quand la soumission casse', async () => {
    // Une ligne `queued` sans identifiant de prédiction serait un plan qu'on
    // croit parti et que personne n'attend.
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const video = await readyForClips(tdb, ['video']);
    const { client } = animator({ failOnCall: 1 });

    await expect(
      submitClips(tdb, video.id, { animator: client, store: store().assets })
    ).rejects.toThrow(/payment required/);

    const [job] = await tdb.findMany(jobs, eq(jobs.videoId, video.id));
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/payment required/);
  });

  it('additionne ce que le passage coûtera chez le fournisseur', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const video = await readyForClips(tdb, ['video', 'video']);
    const { client } = animator();

    const result = await submitClips(tdb, video.id, {
      animator: client,
      store: store().assets,
    });

    expect(result.submitted).toBe(2);
    expect(result.costUsd).toBeCloseTo(0.1, 6);
  });

  it('asks the model for the camera move the scene wrote', () => {
    // `cameraMotion` était proposé au modèle, stocké en base, et lu par
    // personne : le clip partait avec un mouvement écrit en dur.
    const shot = { prompt: 'a market at dawn', render: { effects: { cameraMotion: 'dolly' } } };
    expect(animationPrompt(shot as never)).toContain('dolly push');
    expect(animationPrompt(shot as never)).toContain('a market at dawn');
  });

  it('keeps a neutral move when the scene asks for none', () => {
    // Mieux vaut un plan sans intention qu'un plan qui part dans une
    // direction inventée.
    expect(animationPrompt({ prompt: 'a river', render: {} } as never)).toContain(
      'subtle natural motion'
    );
  });

  it('ne soumet pas un compteur, même quand le pipeline force la vidéo', async () => {
    // La seconde régression de la revue : `generateImages` saute un compteur,
    // donc il n'a pas d'image fixe, donc `submitClips` levait « Scene N has no
    // still to animate » et l'étape entière échouait sans retour possible.
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const video = await readyForClips(tdb, ['video', 'video']);
    const [premier] = await tdb.findMany(shots, eq(shots.videoId, video.id));
    await tdb.update(
      shots,
      {
        sourceImageUrl: null,
        assetUrl: null,
        render: { counter: { value: 42, label: 'unites' } },
        updatedAt: new Date(),
      },
      eq(shots.id, premier.id)
    );

    const { client, calls } = animator();
    const result = await submitClips(tdb, video.id, {
      animator: client,
      store: store().assets,
    });

    expect(result.submitted).toBe(1);
    expect(calls).toHaveLength(1);
  });
});
