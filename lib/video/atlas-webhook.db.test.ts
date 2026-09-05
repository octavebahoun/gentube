import { generateKeyPairSync, sign } from 'node:crypto';
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
import { processAtlasWebhook, type AtlasJwk } from './atlas-webhook';

/**
 * Un rappel Atlas de bout en bout.
 *
 * `atlas-webhook.test.ts` prouve que la signature Ed25519 tient. Ici on prouve
 * que la charge d'Atlas — `session_id`, `payload.status`, `payload.outputs`,
 * qui n'ont rien des noms de Replicate — mène au même résultat : le clip sur
 * R2, le plan prêt, et le remboursement quand le fournisseur a renoncé.
 *
 * Aucun appel réseau et aucun centime : les clés sont injectées, le
 * fournisseur et le stockage sont des doubles, `fetch` est remplacé.
 */

afterAll(async () => {
  await closeDb();
});

process.env.BASE_URL = 'https://gentube.test';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const JWK: AtlasJwk = {
  ...(publicKey.export({ format: 'jwk' }) as AtlasJwk),
  kid: 'k1',
};

/** Un rappel authentique : Atlas signe `<timestamp>.<corps>`. */
function callback(body: unknown, { now = Date.now() } = {}) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(now / 1000));
  const signature = sign(
    null,
    Buffer.from(`${timestamp}.${raw}`),
    privateKey
  ).toString('base64url');

  return {
    headers: {
      'x-atlascloud-webhook-timestamp': timestamp,
      'x-atlascloud-webhook-signature-ed25519': signature,
      'x-atlascloud-webhook-key-id': 'k1',
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

const answering: JsonCompleter = {
  async completeJson() {
    return {
      data: {
        scenes: [
          {
            narration: line(5),
            type: 'video' as const,
            prompt: 'Visual prompt number 1, wide angle',
          },
        ],
      },
      usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
    };
  },
};

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
  provider: 'atlas',
  resolution: 'webhook',
  callbackPath: '/api/webhooks/atlas',
  async submit() {
    return {
      externalId: 'atl_task_1',
      model: 'atlascloud/wan-2.2/image-to-video',
      costUsd: 0,
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
  await generateStoryboard(tdb, video.id, { client: answering, library: [] });
  await generateVoiceover(tdb, video.id, { client: voice, store: store().assets });
  await validateStoryboard(tdb, video.id);
  await generateImages(tdb, video.id, { client: images, store: store().assets });
  await submitClips(tdb, video.id, { animator, store: store().assets });

  const [job] = await tdb.findMany(jobs, eq(jobs.videoId, video.id));
  return { video, job };
}

const reussi = {
  session_id: 'atl_task_1',
  event_type: 'generation.completed',
  status: 'OK',
  payload: { status: 'completed', outputs: ['https://cdn.atlas/clip.mp4'] },
};

describe('un rappel Atlas', () => {
  beforeEach(async () => {
    await resetDb();
    vi.unstubAllGlobals();
  });

  it('pose le clip sur R2 et marque le plan prêt', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { video, job } = await awaitingClip(tdb);
    const { assets, written } = store();

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Uint8Array.from([0, 1, 2, 3]).buffer,
    }));

    const { headers, raw } = callback(reussi);
    const result = await processAtlasWebhook(headers, raw, {
      jobId: job.id,
      store: assets,
      keys: [JWK],
    });

    expect(result.status).toBe(200);
    // Le même nom que par Replicate : le fournisseur ne doit pas se voir dans
    // le montage.
    expect([...written.keys()]).toEqual([
      `${tdb.tenantId}/videos/${video.id}/clips/scene-1.mp4`,
    ]);

    const [shot] = await tdb.findMany(shots, eq(shots.videoId, video.id));
    expect(shot.status).toBe('ready');

    const [resolved] = await tdb.findMany(jobs, eq(jobs.id, job.id));
    expect(resolved.status).toBe('succeeded');
  });

  it('rembourse la vidéo quand Atlas a renoncé', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { video, job } = await awaitingClip(tdb);
    const avant = await getBalance(tdb);

    const { headers, raw } = callback({
      session_id: 'atl_task_1',
      // `timeout` n'existe pas chez Replicate : c'est bien un échec, la tâche
      // ne reviendra pas.
      payload: { status: 'timeout' },
      error: 'the task expired',
    });
    const result = await processAtlasWebhook(headers, raw, {
      jobId: job.id,
      keys: [JWK],
    });

    expect(result.status).toBe(200);
    expect(await getBalance(tdb)).toBeGreaterThan(avant);

    const [apres] = await tdb.findMany(videos, eq(videos.id, video.id));
    expect(apres.status).toBe('failed');
  });

  it('n écrit rien sur une charge non signée', async () => {
    /*
     * Le contrôle qui compte : sans lui, n'importe qui poste un `session_id`
     * et une URL de son choix, et le plan la porte.
     */
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { job } = await awaitingClip(tdb);

    const { headers, raw } = callback(reussi);
    const forge = raw.replace('cdn.atlas', 'mechant.example');

    const result = await processAtlasWebhook(headers, forge, {
      jobId: job.id,
      keys: [JWK],
    });

    expect(result.status).toBe(401);
    const [intact] = await tdb.findMany(jobs, eq(jobs.id, job.id));
    expect(intact.status).toBe(job.status);
  });

  it('refuse un rappel périmé', async () => {
    // Rejouer un rappel authentique d'il y a une heure ne doit rien rouvrir.
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    const { job } = await awaitingClip(tdb);

    const { headers, raw } = callback(reussi, { now: Date.now() - 3_600_000 });
    const result = await processAtlasWebhook(headers, raw, {
      jobId: job.id,
      keys: [JWK],
    });

    expect(result.status).toBe(401);
  });
});
