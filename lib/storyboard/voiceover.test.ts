import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { shots, videos } from '@/lib/db/schema';
import { createProject } from '@/lib/projects';
import { createVideo } from '@/lib/videos';
import type { AssetStore } from '@/lib/storage';
import { StorageNotConfiguredError } from '@/lib/storage';
import { VoiceError, type VoiceSynthesizer } from '@/lib/voice/elevenlabs';
import type { TenantDb } from '@/lib/db/tenant-db';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import type { JsonCompleter } from '@/lib/llm/deepseek';
import { NARRATION_CHARS_PER_SECOND, generateStoryboard, validateStoryboard } from './service';
import { generateVoiceover } from './voiceover';

afterAll(async () => {
  await closeDb();
});

const line = (seconds: number, label = 'a') =>
  label.repeat(seconds * NARRATION_CHARS_PER_SECOND);

function answering(scenes: { narration: string; type?: string }[]): JsonCompleter {
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

/** Une voix qui rapporte toujours la même longueur mesurée. */
function voice(durationS = 5.28) {
  const calls: { text: string; voice?: string | null }[] = [];
  const synthesizer: VoiceSynthesizer = {
    async synthesize(text, requested) {
      calls.push({ text, voice: requested });
      return {
        audio: Buffer.from('mp3'),
        contentType: 'audio/mpeg',
        words: [{ text: text.slice(0, 4), start: 0.1, duration: durationS - 0.1 }],
        durationS,
      };
    },
  };
  return { synthesizer, calls };
}

function store() {
  const written: string[] = [];
  const assets: AssetStore = {
    async put(key) {
      written.push(key);
      return key;
    },
    async signedUrl(key) {
      return `https://r2.test/${key}`;
    },
  };
  return { assets, written };
}

async function draftWithScenes(
  tdb: TenantDb,
  narrations: string[],
  { voiceId }: { voiceId?: string } = {}
) {
  const project = await createProject(tdb, {
    name: 'Docs',
    defaultPipeline: 'video',
    voiceId,
  });
  const video = await createVideo(tdb, {
    projectId: project.id,
    title: 'Les Amazones',
  });
  await generateStoryboard(tdb, video.id, {
    client: answering(narrations.map((narration) => ({ narration }))),
    library: [],
  });
  return video;
}

describe('recording the voice-over', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('replaces the estimate with the measured length, and re-prices', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const video = await draftWithScenes(tdb, [line(4), line(6)]);
    const { synthesizer } = voice(5.28);
    const { assets, written } = store();

    const result = await generateVoiceover(tdb, video.id, {
      client: synthesizer,
      store: assets,
    });

    expect(result.voiced).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.durationsMeasured).toBe(true);
    expect(result.shots.map((shot) => shot.durationS)).toEqual([5.28, 5.28]);
    expect(result.shots.map((shot) => shot.durationSource)).toEqual([
      'measured',
      'measured',
    ]);
    // Chaque scène est arrondie au-dessus individuellement : 11 + 11, pas
    // ceil(21,12). Deux plans animés de 5,28 s à 2 crédits/s.
    expect(result.creditsEstimated).toBe(22);
    expect(result.shots.every((shot) => Array.isArray(shot.words))).toBe(true);

    // L'audio atterrit sous le préfixe du tenant, un objet par scène.
    expect(written).toHaveLength(2);
    expect(written.every((key) => key.startsWith(`${tdb.tenantId}/videos/${video.id}/`))).toBe(true);
    expect(result.shots.map((shot) => shot.audioUrl)).toEqual(written);
  });

  it('reads the voice off the video, then the project', async () => {
    const tdb = await createTenant('Alpha');
    const video = await draftWithScenes(tdb, [line(3)], { voiceId: 'anais' });
    const { synthesizer, calls } = voice();
    const { assets } = store();

    await generateVoiceover(tdb, video.id, { client: synthesizer, store: assets });
    expect(calls[0].voice).toBe('anais');

    await tdb.update(videos, { voice: 'liam' }, eq(videos.id, video.id));
    await tdb.update(shots, { durationSource: 'estimated', audioUrl: null }, eq(shots.videoId, video.id));
    await generateVoiceover(tdb, video.id, { client: synthesizer, store: assets });
    expect(calls[1].voice).toBe('liam');
  });

  it('skips what is already recorded instead of paying twice', async () => {
    const tdb = await createTenant('Alpha');
    const video = await draftWithScenes(tdb, [line(3), line(3)]);
    const { synthesizer, calls } = voice();
    const { assets } = store();

    await generateVoiceover(tdb, video.id, { client: synthesizer, store: assets });
    const again = await generateVoiceover(tdb, video.id, {
      client: synthesizer,
      store: assets,
    });

    expect(again.voiced).toBe(0);
    expect(again.skipped).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it('keeps what it recorded when a later scene fails', async () => {
    const tdb = await createTenant('Alpha');
    const video = await draftWithScenes(tdb, [line(3), line(4)]);
    const { assets } = store();

    let call = 0;
    const flaky: VoiceSynthesizer = {
      async synthesize(text) {
        call += 1;
        if (call === 2) throw new VoiceError('ElevenLabs returned HTTP 429');
        return {
          audio: Buffer.from('mp3'),
          contentType: 'audio/mpeg',
          words: [{ text: 'x', start: 0.1, duration: 2.9 }],
          durationS: 3,
        };
      },
    };

    await expect(
      generateVoiceover(tdb, video.id, { client: flaky, store: assets })
    ).rejects.toThrow(VoiceError);

    // La première scène est mesurée et le reste : une reprise reprend au lieu
    // de payer à nouveau tout le storyboard.
    const rows = await tdb.findMany(shots, eq(shots.videoId, video.id));
    const sources = rows.map((shot) => shot.durationSource).sort();
    expect(sources).toEqual(['estimated', 'measured']);
  });

  it('says plainly that storage is missing rather than half-working', async () => {
    const tdb = await createTenant('Alpha');
    const video = await draftWithScenes(tdb, [line(3)]);
    const { synthesizer } = voice();

    await expect(
      generateVoiceover(tdb, video.id, { client: synthesizer })
    ).rejects.toThrow(StorageNotConfiguredError);
  });

  it('unlocks validation, which then charges the measured price', async () => {
    const tdb = await createTenant('Alpha', { credits: 100 });
    const video = await draftWithScenes(tdb, [line(4)]);
    const { synthesizer } = voice(4.5);
    const { assets } = store();

    await expect(validateStoryboard(tdb, video.id)).rejects.toThrow(
      /voice-over first/
    );

    await generateVoiceover(tdb, video.id, { client: synthesizer, store: assets });
    const { charged, balance } = await validateStoryboard(tdb, video.id);

    expect(charged).toBe(9); // ceil(4,5 × 2) pour un plan animé en 480p
    expect(balance).toBe(91);
  });

  it('refuses once the video left draft', async () => {
    const tdb = await createTenant('Alpha');
    const video = await draftWithScenes(tdb, [line(3)]);
    await tdb.update(videos, { status: 'generating' }, eq(videos.id, video.id));
    const { synthesizer } = voice();
    const { assets } = store();

    await expect(
      generateVoiceover(tdb, video.id, { client: synthesizer, store: assets })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('hides another tenant video', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const video = await draftWithScenes(alpha, [line(3)]);
    const { synthesizer } = voice();
    const { assets } = store();

    await expect(
      generateVoiceover(beta, video.id, { client: synthesizer, store: assets })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
