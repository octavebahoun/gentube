import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { jobs, shots, videos } from '@/lib/db/schema';
import { createProject } from '@/lib/projects';
import { createVideo } from '@/lib/videos';
import type { AssetStore } from '@/lib/storage';
import type { TenantDb } from '@/lib/db/tenant-db';
import type { JsonCompleter } from '@/lib/llm/deepseek';
import type { ImageGenerator } from '@/lib/images/flux';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import {
  NARRATION_CHARS_PER_SECOND,
  generateStoryboard,
  validateStoryboard,
} from '@/lib/storyboard/service';
import { generateVoiceover } from '@/lib/storyboard/voiceover';
import { generateImages } from '@/lib/storyboard/images';
import { materialize } from './materialize';
import { collectRender, startRender } from './service';
import type { RenderEngine, RenderState, StartedRender } from './lambda';

afterAll(async () => {
  await closeDb();
});

const line = (seconds: number) => 'a'.repeat(seconds * NARRATION_CHARS_PER_SECOND);

function answering(count: number): JsonCompleter {
  return {
    async completeJson() {
      return {
        data: {
          scenes: Array.from({ length: count }, (_, index) => ({
            narration: line(4),
            type: 'image' as const,
            prompt: `Visual prompt number ${index + 1}, wide angle`,
          })),
        },
        usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
      };
    },
  };
}

const voice = {
  async synthesize(text: string) {
    return {
      audio: Buffer.from('mp3-bytes'),
      contentType: 'audio/mpeg',
      words: [{ text: text.slice(0, 4), start: 0, duration: 4 }],
      durationS: 4,
    };
  },
};

const images: ImageGenerator = {
  async generate() {
    return {
      bytes: Buffer.from('jpeg-bytes'),
      contentType: 'image/jpeg',
      width: 848,
      height: 480,
    };
  },
};

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

/** Un moteur qui note ce qu'on lui demande et rend l'état qu'on lui dicte. */
function engine({
  status = 'succeeded',
  errors = [],
  failStart,
}: {
  status?: RenderState['status'];
  errors?: string[];
  failStart?: boolean;
} = {}) {
  const starts: { projectDir: string; executionName: string }[] = [];
  const downloads: string[] = [];
  /** Ce que la matérialisation avait posé sur disque au moment du démarrage. */
  let capturedDir: string[] = [];
  let capturedHtml = '';

  const client: RenderEngine = {
    async start(input): Promise<StartedRender> {
      starts.push({
        projectDir: input.projectDir,
        executionName: input.executionName,
      });
      capturedDir = await readdir(input.projectDir);
      capturedHtml = await readFile(join(input.projectDir, 'index.html'), 'utf8');
      if (failStart) throw new Error('Step Functions refused the execution.');
      return {
        renderId: input.executionName,
        executionArn: `arn:aws:states:::execution:hf:${input.executionName}`,
        outputS3Uri: `s3://bucket/renders/${input.executionName}/output.mp4`,
      };
    },
    async state(executionArn): Promise<RenderState> {
      return {
        status,
        progress: status === 'succeeded' ? 1 : 0.42,
        framesRendered: 120,
        totalFrames: status === 'succeeded' ? 120 : 300,
        costUsd: 0.0214,
        output:
          status === 'succeeded'
            ? { s3Uri: `s3://bucket/${executionArn}.mp4`, bytes: 2_600_000 }
            : null,
        errors,
      };
    },
    async download(s3Uri) {
      downloads.push(s3Uri);
      return Buffer.from('mp4-bytes');
    },
  };

  return {
    client,
    starts,
    downloads,
    dir: () => capturedDir,
    html: () => capturedHtml,
  };
}

/** Une vidéo payée dont tous les visuels existent : prête à monter. */
async function readyVideo(tdb: TenantDb, sceneCount = 2) {
  const assets = store();
  const project = await createProject(tdb, {
    name: 'Docs',
    defaultPipeline: 'image',
  });
  const video = await createVideo(tdb, {
    projectId: project.id,
    title: 'Les Amazones',
  });
  await generateStoryboard(tdb, video.id, {
    client: answering(sceneCount),
    library: [],
  });
  await generateVoiceover(tdb, video.id, { client: voice, store: assets.assets });
  await validateStoryboard(tdb, video.id);
  await generateImages(tdb, video.id, { client: images, store: assets.assets });
  return { video, assets };
}

describe('starting the assembly', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('materialises the assets, starts one execution, and records it', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const lambda = engine();

    const result = await startRender(tdb, video.id, {
      engine: lambda.client,
      store: assets.assets,
    });

    expect(lambda.starts).toHaveLength(1);
    expect(result.video.status).toBe('rendering');
    expect(result.job.step).toBe('render');
    expect(result.job.status).toBe('running');
    // L'identifiant d'exécution est ce qui permet à un webhook rejoué de
    // résoudre exactement un job.
    expect(result.job.externalId).toBe(lambda.starts[0].executionName);
    expect(result.job.externalId).toContain(`${tdb.tenantId}-${video.id}-1`);
  });

  it('puts the media on disk, not signed URLs in the HTML', async () => {
    // Une URL signée expire au milieu d'un rendu de plusieurs minutes, et un
    // plan qui échoue à charger ne fait pas échouer le rendu : il produit une
    // scène noire dans une vidéo déjà facturée.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const lambda = engine();

    await startRender(tdb, video.id, {
      engine: lambda.client,
      store: assets.assets,
    });

    expect(lambda.dir()).toContain('index.html');
    expect(lambda.dir()).toContain('media');
    expect(lambda.dir()).toContain('voice');
    expect(lambda.dir()).toContain('style.css');
    expect(lambda.dir()).toContain('vendor');

    const html = lambda.html();
    expect(html).toContain('media/scene-1.jpg');
    expect(html).toContain('voice/scene-1.mp3');
    expect(html).not.toContain('https://');
  });

  it('never leaks the tenant id into the render directory', async () => {
    // Les chemins traversent Chrome et finissent dans des logs. Le dossier
    // temporaire ne doit rien dire de qui possède la vidéo.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const lambda = engine();

    await startRender(tdb, video.id, {
      engine: lambda.client,
      store: assets.assets,
    });

    expect(lambda.html()).not.toContain(`${tdb.tenantId}/videos/`);
  });

  it('does not start a second execution when one is already running', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const lambda = engine();

    const first = await startRender(tdb, video.id, {
      engine: lambda.client,
      store: assets.assets,
    });
    const again = await startRender(tdb, video.id, {
      engine: lambda.client,
      store: assets.assets,
    });

    // Deux exécutions, c'est deux fois le prix du même montage.
    expect(lambda.starts).toHaveLength(1);
    expect(again.job.id).toBe(first.job.id);
  });

  it('cleans up the render directory even when the start fails', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const lambda = engine({ failStart: true });

    await expect(
      startRender(tdb, video.id, { engine: lambda.client, store: assets.assets })
    ).rejects.toThrow(/refused the execution/);

    // Un dossier temporaire abandonné est une fuite de disque qui ne se voit
    // qu'une fois la machine pleine.
    await expect(readdir(lambda.starts[0].projectDir)).rejects.toThrow();
  });

  it('refuses a video whose visuals are missing', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    // On efface le visuel d'une scène : la vidéo est payée, mais incomplète.
    const [first] = await tdb.findMany(shots, eq(shots.videoId, video.id));
    await tdb.update(shots, { assetUrl: null }, eq(shots.id, first.id));

    const lambda = engine();
    await expect(
      startRender(tdb, video.id, { engine: lambda.client, store: assets.assets })
    ).rejects.toThrow(/no visual yet/);
    expect(lambda.starts).toHaveLength(0);
  });

  it('refuses a draft and a validated video, which have no visuals', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const assets = store();
    const project = await createProject(tdb, {
      name: 'Docs',
      defaultPipeline: 'image',
    });
    const video = await createVideo(tdb, {
      projectId: project.id,
      title: 'Brouillon',
    });
    await generateStoryboard(tdb, video.id, { client: answering(1), library: [] });

    await expect(
      startRender(tdb, video.id, { engine: engine().client, store: assets.assets })
    ).rejects.toThrow(/no visuals yet/);
  });

  it('refuses to reassemble a video already delivered', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    await tdb.update(videos, { status: 'rendered' }, eq(videos.id, video.id));

    await expect(
      startRender(tdb, video.id, { engine: engine().client, store: assets.assets })
    ).rejects.toThrow(/rendered/);
  });
});

describe('collecting the assembly', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('stores the MP4 under the tenant prefix and finishes the video', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const lambda = engine();

    await startRender(tdb, video.id, {
      engine: lambda.client,
      store: assets.assets,
    });
    const result = await collectRender(tdb, video.id, {
      engine: lambda.client,
      store: assets.assets,
    });

    expect(result.video.status).toBe('rendered');
    expect(result.outputUrl).toBe(
      `${tdb.tenantId}/videos/${video.id}/render/final.mp4`
    );
    expect(result.video.outputUrl).toBe(result.outputUrl);
    expect(assets.bytes.get(result.outputUrl!)?.toString()).toBe('mp4-bytes');
    expect(result.job.status).toBe('succeeded');
  });

  it('records what the render actually cost', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const lambda = engine();

    await startRender(tdb, video.id, { engine: lambda.client, store: assets.assets });
    const result = await collectRender(tdb, video.id, {
      engine: lambda.client,
      store: assets.assets,
    });

    // Le coût mesuré est ce qui permet de vérifier les ~12 FCFA la minute
    // annoncés dans docs/tarifs.md, au lieu de les supposer.
    expect((result.job.payload as { costUsd?: number }).costUsd).toBe(0.0214);
  });

  it('reports progress without touching the video while it runs', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const lambda = engine({ status: 'running' });

    await startRender(tdb, video.id, { engine: lambda.client, store: assets.assets });
    const result = await collectRender(tdb, video.id, {
      engine: lambda.client,
      store: assets.assets,
    });

    expect(result.state?.progress).toBe(0.42);
    expect(result.video.status).toBe('rendering');
    expect(result.outputUrl).toBeNull();
    expect(lambda.downloads).toHaveLength(0);
  });

  it('does not download the same MP4 twice', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const lambda = engine();

    await startRender(tdb, video.id, { engine: lambda.client, store: assets.assets });
    await collectRender(tdb, video.id, { engine: lambda.client, store: assets.assets });
    await collectRender(tdb, video.id, { engine: lambda.client, store: assets.assets });

    expect(lambda.downloads).toHaveLength(1);
  });

  it('leaves a failed render resumable instead of marking the video failed', async () => {
    // Les crédits sont déjà débités et les visuels existent : une relance ne
    // repaie rien. Marquer la vidéo `failed` fermerait la porte à la reprise.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const failing = engine({
      status: 'failed',
      errors: ['Assemble: States.TaskFailed — out of memory'],
    });

    await startRender(tdb, video.id, { engine: failing.client, store: assets.assets });
    const result = await collectRender(tdb, video.id, {
      engine: failing.client,
      store: assets.assets,
    });

    expect(result.job.status).toBe('failed');
    expect(result.job.error).toContain('out of memory');
    expect(result.video.status).toBe('rendering');
    expect(result.outputUrl).toBeNull();
  });

  it('restarts a failed render under a new execution name', async () => {
    // Step Functions refuse deux exécutions du même nom : sans compteur de
    // tentative, une relance échouerait sur un conflit de nom.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const failing = engine({ status: 'failed', errors: ['boom'] });

    await startRender(tdb, video.id, { engine: failing.client, store: assets.assets });
    await collectRender(tdb, video.id, { engine: failing.client, store: assets.assets });

    const retry = engine();
    const restarted = await startRender(tdb, video.id, {
      engine: retry.client,
      store: assets.assets,
    });

    expect(retry.starts[0].executionName).toContain(`${video.id}-2`);
    expect(restarted.job.attempts).toBe(2);
    // Un seul job de montage par vidéo, quel que soit le nombre d'essais.
    expect(await tdb.count(jobs, eq(jobs.videoId, video.id))).toBe(1);
  });

  it('refuses to collect a video that was never started', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);

    await expect(
      collectRender(tdb, video.id, { engine: engine().client, store: assets.assets })
    ).rejects.toThrow(/no assembly under way/);
  });
});

describe('materialising a render directory', () => {
  it('deletes the directory on cleanup', async () => {
    const reader = {
      async get() {
        return Buffer.from('bytes');
      },
    };
    const prepared = await materialize(
      {
        title: 'T',
        ratio: '16:9',
        subtitles: true,
        subtitleStyle: 'karaoke',
        musicVolume: 0.09,
        sfxVolume: 1,
        durationInSeconds: 5,
        fps: 30,
        width: 848,
        height: 480,
        scenes: [],
      } as never,
      reader
    );

    await expect(readdir(prepared.dir)).resolves.toContain('index.html');
    await prepared.cleanup();
    await expect(readdir(prepared.dir)).rejects.toThrow();
  });

  it('assembles a video whose card draws its own screen', async () => {
    // La régression trouvée à la revue : l'étape image saute une carte, donc
    // son `assetUrl` reste nul, donc l'assemblage refusait toute la vidéo — et
    // relancer ne changeait rien puisque l'étape la saute encore. La vidéo
    // restait bloquée en `generating`, crédits débités.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await readyVideo(tdb);
    const [premier] = await tdb.findMany(shots, eq(shots.videoId, video.id));

    await tdb.update(
      shots,
      { assetUrl: null, render: { card: { text: 'Fin' } }, updatedAt: new Date() },
      eq(shots.id, premier.id)
    );

    await expect(
      startRender(tdb, video.id, { engine: engine().client, store: assets.assets })
    ).resolves.toBeDefined();
  });
});
