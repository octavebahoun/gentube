import { describe, expect, it } from 'vitest';
import type { Shot, Video } from '@/lib/db/schema';
import {
  FPS,
  MIN_SCENE_FRAMES,
  POST_NARRATION_PAUSE_FRAMES,
  dimensionsFor,
  sceneDurationInFrames,
  toRemotionStoryboard,
  totalDurationInFrames,
  transitionDurationFrames,
} from './render';

describe('timing', () => {
  it('holds the media past the narration, longer than any transition', () => {
    // The pause must outlast the longest transition, or one scene's voice plays
    // over the next one's.
    const longest = Math.max(
      ...['fade', 'slide', 'black', 'wipe', 'zoomPunch', 'whipPan', 'glitchCut', 'particleDissolve']
        .filter((transition) => transition !== 'particleDissolve')
        .map(transitionDurationFrames)
    );
    expect(POST_NARRATION_PAUSE_FRAMES).toBeGreaterThan(longest);
  });

  it('rounds a fractional narration up to whole frames, plus the pause', () => {
    expect(sceneDurationInFrames({ durationInSeconds: 5.28 })).toBe(
      Math.ceil(5.28 * FPS) + POST_NARRATION_PAUSE_FRAMES
    );
  });

  it('gives a card no pause, having nothing to digest', () => {
    expect(sceneDurationInFrames({ durationInSeconds: 2, card: { text: 'Fin' } })).toBe(
      2 * FPS
    );
  });

  it('never goes below the floor', () => {
    expect(sceneDurationInFrames({ durationInSeconds: 0.1, card: {} })).toBe(
      MIN_SCENE_FRAMES
    );
  });

  it('subtracts the overlap of each transition from the total', () => {
    const scenes = [
      { durationInSeconds: 5 },
      { durationInSeconds: 5, effects: { transition: 'black' } },
      { durationInSeconds: 5, effects: { transition: 'glitchCut' } },
    ];

    const perScene = 5 * FPS + POST_NARRATION_PAUSE_FRAMES;
    // The first scene overlaps nothing; the others eat into their predecessor.
    expect(totalDurationInFrames(scenes)).toBe(perScene * 3 - 26 - 8);
  });

  it('sizes the canvas from the ratio', () => {
    expect(dimensionsFor('16:9')).toEqual({ width: 1920, height: 1080 });
    expect(dimensionsFor('9:16')).toEqual({ width: 1080, height: 1920 });
  });
});

describe('serialising for Remotion', () => {
  const video = {
    title: 'Les Amazones',
    ratio: '16:9',
    voice: null,
    subtitles: true,
    subtitleStyle: 'karaoke',
    musicUrl: null,
    musicVolume: 0.09,
    sfxVolume: 1,
  } as unknown as Video;

  function shot(overrides: Partial<Shot>): Shot {
    return {
      id: 1,
      videoId: 1,
      tenantId: 1,
      order: 1,
      type: 'video',
      prompt: 'Warriors at dawn',
      narration: 'Au XVIIe siècle…',
      subtitle: null,
      audioUrl: '1/videos/1/scene-1.mp3',
      durationS: 5.28,
      durationSource: 'measured',
      words: [{ text: 'Au', start: 0.1, duration: 0.2 }],
      render: { effects: { zoom: 'in' }, sounds: [{ src: 'sounds/sfx/pop.mp3' }] },
      assetUrl: '1/videos/1/scene-1.jpeg',
      status: 'ready',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Shot;
  }

  it('produces the shape the composition consumes', () => {
    const storyboard = toRemotionStoryboard(video, [shot({})]);

    expect(storyboard).toMatchObject({
      title: 'Les Amazones',
      ratio: '16:9',
      subtitles: true,
      subtitleStyle: 'karaoke',
      musicVolume: 0.09,
      sfxVolume: 1,
    });
    expect(storyboard.scenes[0]).toMatchObject({
      id: 1,
      narration: 'Au XVIIe siècle…',
      mediaPath: '1/videos/1/scene-1.jpeg',
      audioPath: '1/videos/1/scene-1.mp3',
      durationInSeconds: 5.28,
      effects: { zoom: 'in' },
      sounds: [{ src: 'sounds/sfx/pop.mp3' }],
    });
    expect(storyboard.scenes[0].words).toHaveLength(1);
  });

  it('numbers the scenes positionally, whatever the row ids are', () => {
    const storyboard = toRemotionStoryboard(video, [
      shot({ id: 91, order: 1 }),
      shot({ id: 12, order: 2 }),
    ]);
    expect(storyboard.scenes.map((scene) => scene.id)).toEqual([1, 2]);
  });

  it('falls back to the project voice, and omits what is unset', () => {
    const storyboard = toRemotionStoryboard(
      video,
      [shot({ words: null, audioUrl: null, assetUrl: null, render: null })],
      { fallbackVoice: 'liam' }
    );

    expect(storyboard.voice).toBe('liam');
    expect(storyboard.scenes[0].words).toBeUndefined();
    expect(storyboard.scenes[0].mediaPath).toBeUndefined();
    expect(storyboard.scenes[0].audioPath).toBeUndefined();
  });

  it('drops a render blob that does not match the contract', () => {
    // Garbage in the jsonb column must not reach the renderer as-is.
    const storyboard = toRemotionStoryboard(video, [
      shot({ render: { effects: { zoom: 'sideways' } } as unknown as Shot['render'] }),
    ]);
    expect(storyboard.scenes[0].effects).toBeUndefined();
  });
});
