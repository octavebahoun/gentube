import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { jobs, shots, videos } from '@/lib/db/schema';
import type { TenantDb } from '@/lib/db/tenant-db';
import type { AssetStore } from '@/lib/storage';
import type { JsonCompleter } from '@/lib/llm/deepseek';
import { createProject } from '@/lib/projects';
import { createVideo } from '@/lib/videos';
import { getBalance } from '@/lib/credits';
import {
  NARRATION_CHARS_PER_SECOND,
  generateStoryboard,
  validateStoryboard,
} from '@/lib/storyboard/service';
import { generateVoiceover } from '@/lib/storyboard/voiceover';
import { generateImages } from '@/lib/storyboard/images';
import { submitClips } from '@/lib/storyboard/clips';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import type { VideoAnimator } from './contract';
import { processReplicateWebhook } from './webhook';

/**
 * Ce que la signature ne couvre pas.
 *
 * `webhook.test.ts` prouve qu'un corps modifié est rejeté. Ici on prouve ce qui
 * se passe **après** : retrouver le job, descendre le clip, le poser sur R2,
 * marquer le plan prêt, et rembourser quand le fournisseur a échoué.
 *
 * Aucun appel réseau et aucun centime : le fournisseur est un double, le
 * stockage aussi, et `fetch` est remplacé le temps du test.
 */

afterAll(async () => {
  await closeDb();
});

const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
process.env.REPLICATE_WEBHOOK_SECRET = SECRET;
process.env.BASE_URL = 'https://gentube.test';

/** Un rappel authentique : mêmes en-têtes et même signature que Replicate. */
function callback(body: unknown, { id = 'msg_1', now = Date.now() } = {}) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(now / 1000));
  const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
  const digest = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${raw}`)
    .digest('base64');

  return {
    headers: {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${digest}`,
    },
    raw,
  };
}

function store() {
  const written = new Map<string, Buffer>();
  const assets: AssetStore = {
    async put(key, body) {
      written.set(key, body);
      return key;
    },
    async get(key) {
      const found = written.get(key);
      if (!found) throw new Error(`No such object: ${key}`);
      return found;
    },
    async signedUrl(key) {
      return `https://r2.test/${key}?signed`;
    },
  };
  return { assets, written };
}

const line = (seconds: number) =>
  'a'.repeat(Math.round(seconds * NARRATION_CHARS_PER_SECOND));

const answering = (types: ('image' | 'video')[]): JsonCompleter => ({
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
});

const voice = {
  async synthesize(text: string) {
    return {
      audio: Buffer.from('mp3'),
      contentType: 'audio/mpeg',
      words: [{ text: text.slice(0, 4), start: 0, duration: 5 }],
      durationS: 5,
    };
  },
};

const images = {
  async generate() {
    return {
      bytes: Buffer.from('jpeg'),
      contentType: 'image/jpeg',
      width: 848,
      height: 480,
    };
  },
};

const animator: VideoAnimator = {
  async submit() {
    return {
      externalId: 'pred_1',
      model: 'wan-video/wan-2.2-i2v-fast',
      costUsd: 0.05,
    };
  },
  async outcome() {
    return { status: 'pending' as const };
  },
};

/** Une vidéo validée dont l'unique plan animé attend son clip. */
async function awaitingClip(tdb: TenantDb) {
  const project = await createProject(tdb, {
    name: 'Docs',
    defaultPipeline: 'mixed',
  });
  const video = await createVideo(tdb, {
    projectId: project.id,
    title: 'Les Amazones',
  });
  await generateStoryboard(tdb, video.id, {
    client: answering(['video']),
    library: [],
  });
  await generateVoiceover(tdb, video.id, { client: voice, store: store().assets });
  await validateStoryboard(tdb, video.id);
  await generateImages(tdb, video.id, { client: images, store: store().assets });
  await submitClips(tdb, video.id, { animator, store: store().assets });

  const [job] = await tdb.findMany(jobs, eq(jobs.videoId, video.id));
  return { video, job };
}

const succeeded = { id: 'pred_1', status: 'succeeded', output: 'https://x/y.mp4' };

describe('resolving a clip callback', () => {
  beforeEach(async () => {
    await resetDb();
    vi.unstubAllGlobals();
  });

  it('stores the clip on R2 and marks the shot ready', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { video, job } = await awaitingClip(tdb);
    const { assets, written } = store();

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Uint8Array.from([0, 1, 2, 3]).buffer,
    }));

    const { headers, raw } = callback(succeeded);
    const result = await processReplicateWebhook(headers, raw, {
      jobId: job.id,
      store: assets,
    });

    expect(result.status).toBe(200);
    // Le nom suit le plan de `docs/contrats.md` §3, sur l'ordre et non l'id.
    expect([...written.keys()]).toEqual([
      `${tdb.tenantId}/videos/${video.id}/clips/scene-1.mp4`,
    ]);

    const [shot] = await tdb.findMany(shots, eq(shots.videoId, video.id));
    expect(shot.status).toBe('ready');
    expect(shot.assetUrl).toContain('clips/scene-1.mp4');

    const [resolved] = await tdb.findMany(jobs, eq(jobs.id, job.id));
    expect(resolved.status).toBe('succeeded');
  });

  it('refunds the video when the provider gave up', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { video, job } = await awaitingClip(tdb);
    const before = await getBalance(tdb);

    const { headers, raw } = callback({
      id: 'pred_1',
      status: 'failed',
      error: 'NSFW content detected',
    });
    const result = await processReplicateWebhook(headers, raw, { jobId: job.id });

    expect(result.status).toBe(200);

    const [failed] = await tdb.findMany(jobs, eq(jobs.id, job.id));
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('NSFW');

    // Les crédits ont été débités à la validation ; un échec fournisseur ne
    // nous coûte rien, donc il ne doit rien coûter au client non plus.
    const [after] = await tdb.findMany(videos, eq(videos.id, video.id));
    expect(after.status).toBe('failed');
    expect(await getBalance(tdb)).toBeGreaterThan(before);
  });

  it('is a no-op on a job it has already resolved', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { job } = await awaitingClip(tdb);
    const { headers, raw } = callback(succeeded);

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Uint8Array.from([0, 1, 2, 3]).buffer,
    }));
    await processReplicateWebhook(headers, raw, {
      jobId: job.id,
      store: store().assets,
    });

    // Un rejeu ne doit ni retélécharger, ni réécrire, ni rembourser deux fois.
    vi.stubGlobal('fetch', async () => {
      throw new Error('le rejeu ne doit rien retélécharger');
    });
    const again = await processReplicateWebhook(headers, raw, { jobId: job.id });

    expect(again.status).toBe(200);
    expect(again.body.message).toMatch(/already/i);
  });

  it('refuses a job that is running another prediction', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { job } = await awaitingClip(tdb);

    const { headers, raw } = callback({ ...succeeded, id: 'pred_autre' });
    const result = await processReplicateWebhook(headers, raw, { jobId: job.id });

    expect(result.status).toBe(409);
  });

  it('answers 200 to an authentic callback for an unknown prediction', async () => {
    // Une prédiction d'un autre environnement partageant le compte Replicate.
    // La redélivrer n'y changerait rien.
    await createTenant('Alpha', { credits: 5_000 });
    const { headers, raw } = callback({ ...succeeded, id: 'pred_inconnu' });

    const result = await processReplicateWebhook(headers, raw);
    expect(result.status).toBe(200);
  });

  it('keeps the job open when the clip cannot be fetched', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { job } = await awaitingClip(tdb);

    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503 }));

    const { headers, raw } = callback(succeeded);
    const result = await processReplicateWebhook(headers, raw, { jobId: job.id });

    // 502 et non 200 : c'est une redélivrance qu'on veut, le clip existe encore
    // chez le fournisseur.
    expect(result.status).toBe(502);
    const [untouched] = await tdb.findMany(jobs, eq(jobs.id, job.id));
    expect(untouched.status).toBe('running');
  });

  it('rejects a stale callback before touching the database', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { job } = await awaitingClip(tdb);

    const { headers, raw } = callback(succeeded, { now: Date.now() - 3_600_000 });
    const result = await processReplicateWebhook(headers, raw, { jobId: job.id });

    expect(result.status).toBe(401);
    const [untouched] = await tdb.findMany(jobs, eq(jobs.id, job.id));
    expect(untouched.status).toBe('running');
  });

  it('ne détruit pas la vidéo sur un rappel intermédiaire', async () => {
    // Trouvé à la revue : tout statut non terminal était traité comme un
    // échec définitif — le job perdu, la vidéo remboursée et marquée `failed`,
    // que `assertGeneratable` refuse ensuite. Un seul rappel `processing`
    // suffisait à tout détruire.
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { video, job } = await awaitingClip(tdb);

    const { headers, raw } = callback({ id: 'pred_1', status: 'processing' });
    const result = await processReplicateWebhook(headers, raw, { jobId: job.id });

    expect(result.status).toBe(200);

    const [intact] = await tdb.findMany(jobs, eq(jobs.id, job.id));
    expect(intact.status).toBe('running');
    const [encore] = await tdb.findMany(videos, eq(videos.id, video.id));
    expect(encore.status).not.toBe('failed');
  });
});
