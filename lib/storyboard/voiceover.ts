import { eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { shots } from '@/lib/db/schema';
import { estimateVideo } from '@/lib/credits';
import { getProject } from '@/lib/projects';
import { assertDraft, getVideo } from '@/lib/videos';
import {
  assetKey,
  createAssetStore,
  type AssetStore,
} from '@/lib/storage';
import {
  createVoiceClient,
  type VoiceSynthesizer,
} from '@/lib/voice/elevenlabs';
import { getStoryboard, listShots, type StoryboardView } from './service';

/**
 * The voice-over step — where a storyboard stops being an estimate.
 *
 * It runs BEFORE the expensive visuals and before any payment, on purpose:
 * speech is cheap (cents per thousand characters, against a per-clip price for
 * video), and it is the only way to know how long a scene actually lasts. The
 * amount on the validation button is then the amount debited, exactly.
 *
 * Two properties matter more than speed here:
 *
 *  - **Resumable.** Each scene is written the moment it succeeds. A failure
 *    halfway through leaves the finished scenes measured, and a second run
 *    skips them instead of paying ElevenLabs twice for the same line.
 *  - **Sequential.** Scenes are synthesised one at a time. A dozen parallel
 *    requests would be faster and would also be the fastest way to a 429 on a
 *    provider we do not control.
 */

export type VoiceoverResult = StoryboardView & {
  /** Scenes voiced by this run. Already-measured scenes are not counted. */
  voiced: number;
  skipped: number;
};

export async function generateVoiceover(
  tdb: TenantDb,
  videoId: number,
  {
    client,
    store,
  }: { client?: VoiceSynthesizer; store?: AssetStore } = {}
): Promise<VoiceoverResult> {
  const video = await getVideo(tdb, videoId);
  assertDraft(video);

  const project = await getProject(tdb, video.projectId);
  const storyboard = await listShots(tdb, videoId);

  const speakable = storyboard.filter((shot) => shot.narration?.trim());
  if (speakable.length === 0) {
    throw new Error('No scene has a line to read yet.');
  }

  // Resolved lazily: a video whose scenes are all already measured must not
  // fail just because the provider keys are missing.
  let synthesizer = client;
  let assets = store;

  let voiced = 0;
  let skipped = 0;

  for (const shot of speakable) {
    if (shot.durationSource === 'measured' && shot.audioUrl) {
      skipped += 1;
      continue;
    }

    synthesizer ??= createVoiceClient();
    assets ??= createAssetStore();

    const voiceover = await synthesizer.synthesize(
      shot.narration!,
      video.voice ?? project.voiceId
    );

    const key = await assets.put(
      assetKey(tdb.tenantId, 'videos', String(videoId), `scene-${shot.id}.mp3`),
      voiceover.audio,
      voiceover.contentType
    );

    await tdb.update(
      shots,
      {
        audioUrl: key,
        words: voiceover.words,
        durationS: voiceover.durationS,
        durationSource: 'measured',
        updatedAt: new Date(),
      },
      eq(shots.id, shot.id)
    );

    voiced += 1;
  }

  // The price follows the audio: re-estimating here is what turns the measured
  // durations into the exact number shown on the validation button.
  await estimateVideo(tdb, videoId);

  return { ...(await getStoryboard(tdb, videoId)), voiced, skipped };
}
