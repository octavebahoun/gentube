import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { jobs, videos } from '@/lib/db/schema';
import { createProject } from '@/lib/projects';
import { createVideo } from '@/lib/videos';
import { getBalance } from '@/lib/credits';
import type { AssetStore } from '@/lib/storage';
import type { TenantDb } from '@/lib/db/tenant-db';
import type { JsonCompleter } from '@/lib/llm/deepseek';
import { VoiceError, type VoiceSynthesizer } from '@/lib/voice';
import type { ImageGenerator } from '@/lib/images/flux';
import { ImageError } from '@/lib/images/flux';
import {
  ANIMATE_STEP,
  AnimationError,
  type VideoAnimator,
} from '@/lib/video';
import type { RenderEngine, RenderState, StartedRender } from '@/lib/render/lambda';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import {
  NARRATION_CHARS_PER_SECOND,
  generateStoryboard,
  validateStoryboard,
} from '@/lib/storyboard/service';
import { generateVoiceover } from '@/lib/storyboard/voiceover';
import { generateImages } from '@/lib/storyboard/images';
import { RENDER_STEP } from '@/lib/render/service';
import {
  IMAGE_STEP,
  MAX_JOB_ATTEMPTS,
  VOICEOVER_STEP,
  handleClips,
  handleImages,
  handleRender,
  handleStatus,
  handleVoice,
} from './handlers';
import { handlePublish } from './publish';

afterAll(async () => {
  await closeDb();
});

const TOKEN = 'test-internal-api-token-not-real';

beforeEach(async () => {
  await resetDb();
  process.env.INTERNAL_API_TOKEN = TOKEN;
  process.env.BASE_URL = 'https://gentube.test';
});

const line = (seconds: number) => 'a'.repeat(seconds * NARRATION_CHARS_PER_SECOND);

function authHeaders() {
  return { authorization: `Bearer ${TOKEN}` };
}

function answering(scenes: { narration: string; type?: 'image' | 'video' }[]): JsonCompleter {
  return {
    async completeJson() {
      return {
        data: {
          scenes: scenes.map((scene, index) => ({
            narration: scene.narration,
            type: scene.type ?? 'video',
            prompt: `Visual prompt number ${index + 1}, wide angle`,
          })),
        },
        usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
      };
    },
  };
}

function voice(durationS = 5): VoiceSynthesizer {
  return {
    async synthesize(text) {
      return {
        audio: Buffer.from('mp3'),
        contentType: 'audio/mpeg',
        words: [{ text: text.slice(0, 4), start: 0, duration: durationS }],
        durationS,
      };
    },
  };
}

function images(): ImageGenerator {
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
      return `https://r2.test/${key}`;
    },
  };
  return { assets, bytes };
}

function animator(prefix = 'pred'): VideoAnimator {
  let n = 0;
  return {
    provider: 'test',
    resolution: 'webhook',
    callbackPath: '/api/webhooks/replicate',
    async submit() {
      n += 1;
      return {
        externalId: `${prefix}_${n}`,
        model: 'wan-video/wan-2.2-i2v-fast',
        costUsd: 0.05,
      };
    },
    async outcome() {
      return { status: 'pending' as const };
    },
  };
}

function engine(status: RenderState['status'] = 'succeeded'): RenderEngine {
  return {
    async start(input): Promise<StartedRender> {
      return {
        renderId: input.executionName,
        executionArn: `arn:aws:states:::execution:hf:${input.executionName}`,
        outputS3Uri: `s3://bucket/renders/${input.executionName}/output.mp4`,
      };
    },
    async state(): Promise<RenderState> {
      return {
        status,
        progress: status === 'succeeded' ? 1 : 0.4,
        framesRendered: 10,
        totalFrames: 100,
        costUsd: 0.02,
        output:
          status === 'succeeded'
            ? { s3Uri: 's3://bucket/out.mp4', bytes: 1_000 }
            : null,
        errors: status === 'failed' ? ['Lambda failed'] : [],
      };
    },
    async download() {
      return Buffer.from('mp4-bytes');
    },
  };
}

async function paidVideo(
  tdb: TenantDb,
  types: ('image' | 'video')[] = ['image', 'image']
) {
  const assets = store();
  const project = await createProject(tdb, {
    name: 'Docs',
    defaultPipeline: 'mixed',
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
    store: assets.assets,
  });
  await validateStoryboard(tdb, video.id);
  return { video, assets };
}

async function withStills(tdb: TenantDb, types: ('image' | 'video')[]) {
  const { video, assets } = await paidVideo(tdb, types);
  await generateImages(tdb, video.id, {
    client: images(),
    store: assets.assets,
  });
  return { video, assets };
}

describe('the internal auth gate', () => {
  it('rejects a call without a Bearer before touching the video', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video } = await paidVideo(tdb);

    const result = await handleVoice(
      {},
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { voice: voice(), store: store().assets }
    );

    expect(result.status).toBe(401);
    expect(await tdb.count(jobs)).toBe(0);
  });

  it('rejects publish without token with 401, not 500', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video } = await withStills(tdb, ['image', 'image']);
    await tdb.update(videos, { status: 'rendered', outputUrl: 'test.mp4' }, eq(videos.id, video.id));

    const result = await handlePublish(
      {},
      JSON.stringify({
        tenantId: tdb.tenantId,
        videoId: video.id,
        title: 'Test',
      })
    );

    expect(result.status).toBe(401);
    expect(result.body.message).toMatch(/Unauthorized/);
  });

  it('rejects invalid JSON with 400', async () => {
    const result = await handleVoice(authHeaders(), 'not-json');
    expect(result.status).toBe(400);
  });
});

describe('tenant isolation', () => {
  it('returns 404 when tenantId does not own the video, and writes nothing', async () => {
    const alpha = await createTenant('Alpha', { credits: 1_000 });
    const beta = await createTenant('Beta', { credits: 1_000 });
    const { video } = await paidVideo(alpha);

    const result = await handleVoice(
      authHeaders(),
      JSON.stringify({ tenantId: beta.tenantId, videoId: video.id }),
      { voice: voice(), store: store().assets }
    );

    expect(result.status).toBe(404);
    expect(result.body.message).toMatch(/not found/i);
    expect(await alpha.count(jobs)).toBe(0);
    expect(await beta.count(jobs)).toBe(0);
  });
});

describe('the voice route', () => {
  it('wraps finalizeVoiceover and writes one succeeded job per scene', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await paidVideo(tdb);

    const result = await handleVoice(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { voice: voice(5.4), store: assets.assets }
    );

    expect(result.status).toBe(200);
    expect(result.body.step).toBe(VOICEOVER_STEP);
    const rows = await tdb.findMany(jobs, eq(jobs.videoId, video.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((job) => job.step === VOICEOVER_STEP)).toBe(true);
    expect(rows.every((job) => job.status === 'succeeded')).toBe(true);
    expect(rows.every((job) => job.attempts === 1)).toBe(true);
    expect(rows.every((job) => job.externalId?.startsWith('voiceover:'))).toBe(
      true
    );
  });

  it('refunds after three 5xx attempts', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await paidVideo(tdb);
    const before = await getBalance(tdb);
    const broken: VoiceSynthesizer = {
      async synthesize() {
        throw new VoiceError('Polly timed out', 502);
      },
    };

    for (let n = 0; n < MAX_JOB_ATTEMPTS; n += 1) {
      const result = await handleVoice(
        authHeaders(),
        JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
        { voice: broken, store: assets.assets }
      );
      expect(result.status).toBe(502);
    }

    const [job] = await tdb.findMany(jobs, eq(jobs.videoId, video.id));
    expect(job.attempts).toBe(MAX_JOB_ATTEMPTS);
    expect(job.status).toBe('failed');
    const [fresh] = await tdb.findMany(videos, eq(videos.id, video.id));
    expect(fresh.status).toBe('failed');
    expect(await getBalance(tdb)).toBeGreaterThan(before);
  });
});

describe('the images route', () => {
  it('wraps generateImages and writes image jobs', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await paidVideo(tdb, ['image', 'image']);
    await handleVoice(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { voice: voice(), store: assets.assets }
    );

    const result = await handleImages(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { images: images(), store: assets.assets }
    );

    expect(result.status).toBe(200);
    const rows = await tdb.findMany(
      jobs,
      eq(jobs.step, IMAGE_STEP)
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((job) => job.status === 'succeeded')).toBe(true);
  });

  it('keeps already-drawn scenes succeeded when a later call fails', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await paidVideo(tdb, ['image', 'image']);
    await handleVoice(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { voice: voice(), store: assets.assets }
    );

    let calls = 0;
    const flaky: ImageGenerator = {
      async generate() {
        calls += 1;
        if (calls === 2) throw new ImageError('Workers AI filtered the prompt', 502);
        return {
          bytes: Buffer.from('jpeg'),
          contentType: 'image/jpeg',
          width: 848,
          height: 480,
        };
      },
    };

    const result = await handleImages(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { images: flaky, store: assets.assets }
    );

    expect(result.status).toBe(502);
    const rows = await tdb.findMany(jobs, eq(jobs.step, IMAGE_STEP));
    expect(rows.filter((job) => job.status === 'succeeded')).toHaveLength(1);
    expect(rows.filter((job) => job.status === 'failed')).toHaveLength(1);
  });
});

describe('the clips route', () => {
  it('lets submitClips write animate jobs and does not invent a second step', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { video, assets } = await withStills(tdb, ['image', 'video']);

    const result = await handleClips(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { animator: animator(), store: assets.assets }
    );

    expect(result.status).toBe(200);
    expect(result.body.step).toBe(ANIMATE_STEP);
    const rows = await tdb.findMany(jobs, eq(jobs.videoId, video.id));
    const animate = rows.filter((job) => job.step === ANIMATE_STEP);
    expect(animate).toHaveLength(1);
    expect(animate[0].status).toBe('running');
    expect(rows.some((job) => job.step === 'clip')).toBe(false);
  });
});

describe('the render route', () => {
  it('wraps startRender, which already owns the render job', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await withStills(tdb, ['image', 'image']);
    await handleVoice(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { voice: voice(), store: assets.assets }
    );

    const result = await handleRender(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { engine: engine('running'), store: assets.assets }
    );

    expect(result.status).toBe(200);
    expect(result.body.step).toBe(RENDER_STEP);
    const rows = await tdb.findMany(jobs, eq(jobs.step, RENDER_STEP));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('running');
  });
});

describe('the status route', () => {
  it('treats a still-only video as clips succeeded, and collects a running render', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { video, assets } = await withStills(tdb, ['image', 'image']);
    await handleVoice(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { voice: voice(), store: assets.assets }
    );
    await handleRender(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { engine: engine('succeeded'), store: assets.assets }
    );

    const result = await handleStatus(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { engine: engine('succeeded'), store: assets.assets }
    );

    expect(result.status).toBe(200);
    expect(result.body.steps).toMatchObject({
      voiceover: 'succeeded',
      animate: 'succeeded',
      render: 'succeeded',
    });
    expect(result.body.videoStatus).toBe('rendered');
  });
});

describe('a 409 does not count as a paid attempt', () => {
  it('refuses a draft on the voice route without writing jobs', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const project = await createProject(tdb, { name: 'Docs' });
    const video = await createVideo(tdb, {
      projectId: project.id,
      title: 'Draft',
    });

    const result = await handleVoice(
      authHeaders(),
      JSON.stringify({ tenantId: tdb.tenantId, videoId: video.id }),
      { voice: voice(), store: store().assets }
    );

    expect(result.status).toBe(409);
    expect(await tdb.count(jobs)).toBe(0);
  });
});
