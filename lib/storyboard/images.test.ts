import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { shots, videos } from '@/lib/db/schema';
import { createProject } from '@/lib/projects';
import { createVideo } from '@/lib/videos';
import type { AssetStore } from '@/lib/storage';
import type { TenantDb } from '@/lib/db/tenant-db';
import type { JsonCompleter } from '@/lib/llm/deepseek';
import { ImageError, type ImageGenerator, type ImageRequest } from '@/lib/images/flux';
import { closeDb, createTenant, resetDb, subscribe } from '@/lib/test/fixtures';
import {
  NARRATION_CHARS_PER_SECOND,
  generateStoryboard,
  validateStoryboard,
} from './service';
import { generateVoiceover } from './voiceover';
import { generateImages, visualPrompt } from './images';

afterAll(async () => {
  await closeDb();
});

const line = (seconds: number, label = 'a') =>
  label.repeat(seconds * NARRATION_CHARS_PER_SECOND);

function answering(scenes: { narration: string; type: 'image' | 'video' }[]): JsonCompleter {
  return {
    async completeJson() {
      return {
        data: {
          scenes: scenes.map((scene, index) => ({
            narration: scene.narration,
            type: scene.type,
            prompt: `Visual prompt number ${index + 1}, wide angle`,
          })),
        },
        usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
      };
    },
  };
}

function voice(durationS = 5) {
  return {
    async synthesize(text: string) {
      return {
        audio: Buffer.from('mp3'),
        contentType: 'audio/mpeg',
        words: [{ text: text.slice(0, 4), start: 0, duration: durationS }],
        durationS,
      };
    },
  };
}

/** Un générateur qui note ce qu'on lui demande, et peut échouer à la Nième scène. */
function generator({ failOnCall }: { failOnCall?: number } = {}) {
  const calls: ImageRequest[] = [];
  const client: ImageGenerator = {
    async generate(request) {
      calls.push(request);
      if (failOnCall !== undefined && calls.length === failOnCall) {
        throw new ImageError('Workers AI refused the prompt: content filtered');
      }
      return {
        bytes: Buffer.from(`jpeg-${calls.length}`),
        contentType: 'image/jpeg',
        width: 848,
        height: 480,
      };
    },
  };
  return { client, calls };
}

function store() {
  const written: string[] = [];
  const bytes = new Map<string, Buffer>();
  const assets: AssetStore = {
    async put(key, body) {
      written.push(key);
      bytes.set(key, body);
      return key;
    },
    async get(key) {
      const found = bytes.get(key);
      if (!found) throw new Error(`No such object: ${key}`);
      return found;
    },
    async signedUrl(key) {
      return `https://r2.test/${key}`;
    },
  };
  return { assets, written, bytes };
}

/** Un storyboard mesuré, facturé, prêt à recevoir ses visuels. */
async function validatedVideo(
  tdb: TenantDb,
  types: ('image' | 'video')[],
  { stylePrompt }: { stylePrompt?: string } = {}
) {
  const project = await createProject(tdb, {
    name: 'Docs',
    defaultPipeline: 'mixed',
    stylePrompt,
  });
  const video = await createVideo(tdb, {
    projectId: project.id,
    title: 'Les Amazones',
  });
  await generateStoryboard(tdb, video.id, {
    client: answering(types.map((type) => ({ narration: line(5), type }))),
    library: [],
  });
  await generateVoiceover(tdb, video.id, {
    client: voice(),
    store: store().assets,
  });
  await validateStoryboard(tdb, video.id);
  return video;
}

describe('generating the stills', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('draws one still per scene, animated scenes included', async () => {
    // Wan fait de l'image-to-video : un plan animé a besoin de sa fixe comme
    // matière première, pas comme alternative.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const video = await validatedVideo(tdb, ['image', 'video']);
    const { client, calls } = generator();
    const { assets, written } = store();

    const result = await generateImages(tdb, video.id, { client, store: assets });

    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(0);
    expect(calls).toHaveLength(2);
    expect(written).toEqual([
      `${tdb.tenantId}/videos/${video.id}/images/scene-1.jpg`,
      `${tdb.tenantId}/videos/${video.id}/images/scene-2.jpg`,
    ]);
    expect(result.shots.map((shot) => shot.sourceImageUrl)).toEqual(written);
  });

  it('finishes a still scene but leaves an animated one waiting for its clip', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const video = await validatedVideo(tdb, ['image', 'video']);
    const { client } = generator();

    const result = await generateImages(tdb, video.id, {
      client,
      store: store().assets,
    });

    const [still, animated] = result.shots;
    // `assetUrl` est ce que le rendu consomme. Le poser sur un plan animé
    // ferait rendre la fixe à la place du clip qui n'existe pas encore.
    expect(still.assetUrl).toBe(still.sourceImageUrl);
    expect(still.status).toBe('ready');
    expect(animated.assetUrl).toBeNull();
    expect(animated.status).toBe('pending');
  });

  it('asks for the frame size the customer is billed for', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    await subscribe(tdb);
    const project = await createProject(tdb, { name: 'Docs', defaultPipeline: 'image' });
    const video = await createVideo(tdb, {
      projectId: project.id,
      title: 'HD',
      resolution: '720p',
    });
    await generateStoryboard(tdb, video.id, {
      client: answering([{ narration: line(5), type: 'image' }]),
      library: [],
    });
    await generateVoiceover(tdb, video.id, { client: voice(), store: store().assets });
    await validateStoryboard(tdb, video.id);

    const { client, calls } = generator();
    await generateImages(tdb, video.id, { client, store: store().assets });

    expect(calls[0]).toMatchObject({ resolution: '720p', ratio: '16:9' });
  });

  it('applies the project style, which nothing else applied', async () => {
    // Le prompt système du storyboard interdit au modèle de répéter le style
    // dans chaque scène — « it is applied separately ». Cette étape est ce
    // « separately » ; sans elle le style du projet ne servait à rien.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const video = await validatedVideo(tdb, ['image'], {
      stylePrompt: 'hand-painted gouache, warm ochre palette',
    });
    const { client, calls } = generator();

    await generateImages(tdb, video.id, { client, store: store().assets });

    expect(calls[0].prompt).toBe(
      'Visual prompt number 1, wide angle, hand-painted gouache, warm ochre palette'
    );
  });

  it('leaves the prompt alone when the project has no style', () => {
    expect(visualPrompt(' a baobab ', null)).toBe('a baobab');
    expect(visualPrompt('a baobab', '   ')).toBe('a baobab');
  });

  it('resumes after a failure without repaying for what landed', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const video = await validatedVideo(tdb, ['image', 'image', 'image']);
    const failing = generator({ failOnCall: 2 });

    await expect(
      generateImages(tdb, video.id, { client: failing.client, store: store().assets })
    ).rejects.toThrow(ImageError);
    expect(failing.calls).toHaveLength(2);

    const second = generator();
    const result = await generateImages(tdb, video.id, {
      client: second.client,
      store: store().assets,
    });

    // La première scène est sautée : elle est déjà payée et déjà stockée.
    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(2);
    expect(second.calls).toHaveLength(2);
    expect(result.shots.every((shot) => shot.sourceImageUrl)).toBe(true);
  });

  it('refuses a draft, because nothing has been charged yet', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const project = await createProject(tdb, { name: 'Docs', defaultPipeline: 'image' });
    const video = await createVideo(tdb, { projectId: project.id, title: 'Brouillon' });
    await generateStoryboard(tdb, video.id, {
      client: answering([{ narration: line(5), type: 'image' }]),
      library: [],
    });

    const { client, calls } = generator();
    await expect(
      generateImages(tdb, video.id, { client, store: store().assets })
    ).rejects.toThrow(/still a draft/);
    expect(calls).toHaveLength(0);
  });

  it('refuses a video that is already rendered', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const video = await validatedVideo(tdb, ['image']);
    await tdb.update(videos, { status: 'rendered' }, eq(videos.id, video.id));

    await expect(
      generateImages(tdb, video.id, { client: generator().client, store: store().assets })
    ).rejects.toThrow(/rendered/);
  });

  it('moves the video to generating, and a resume keeps it there', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const video = await validatedVideo(tdb, ['image']);

    const first = await generateImages(tdb, video.id, {
      client: generator().client,
      store: store().assets,
    });
    expect(first.video.status).toBe('generating');

    const again = await generateImages(tdb, video.id, {
      client: generator().client,
      store: store().assets,
    });
    expect(again.video.status).toBe('generating');
    expect(again.skipped).toBe(1);
    expect(again.generated).toBe(0);
  });

  it('does not need provider keys when every still already exists', async () => {
    // Le garde-fou des tests vide CLOUDFLARE_* : si l'étape construisait son
    // client avant de savoir qu'elle n'a rien à faire, ce test lèverait
    // ImageNotConfiguredError.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const video = await validatedVideo(tdb, ['image']);
    await generateImages(tdb, video.id, {
      client: generator().client,
      store: store().assets,
    });

    const result = await generateImages(tdb, video.id);
    expect(result.skipped).toBe(1);
  });

  it('keeps one tenant out of another tenant s folder', async () => {
    const alpha = await createTenant('Alpha', { credits: 1_000 });
    const beta = await createTenant('Beta', { credits: 1_000 });
    const video = await validatedVideo(alpha, ['image']);

    const { assets, written } = store();
    await generateImages(alpha, video.id, { client: generator().client, store: assets });

    expect(written[0].startsWith(`${alpha.tenantId}/`)).toBe(true);
    // Beta ne voit même pas la vidéo d'Alpha.
    await expect(
      generateImages(beta, video.id, { client: generator().client, store: assets })
    ).rejects.toThrow();
  });

  it('refuses a storyboard with no scene at all', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const video = await validatedVideo(tdb, ['image']);
    await tdb.delete(shots, eq(shots.videoId, video.id));

    await expect(
      generateImages(tdb, video.id, { client: generator().client, store: store().assets })
    ).rejects.toThrow(/no scene to illustrate/);
  });
});
