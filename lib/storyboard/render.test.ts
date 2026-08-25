import { describe, expect, it } from 'vitest';
import type { Shot, Video } from '@/lib/db/schema';
import {
  MIN_SCENE_ON_SCREEN_SECONDS,
  POST_NARRATION_PAUSE_SECONDS,
  SHADER_TRANSITIONS,
  TRANSITION_DURATIONS,
  dimensionsFor,
  isShaderTransition,
  sceneDurationSeconds,
  sceneStartTimes,
  toHyperframesStoryboard,
  totalDurationSeconds,
  transitionDurationSeconds,
} from './render';

describe('timing', () => {
  it('holds the media past the narration, longer than EVERY transition', () => {
    // L'ancien contrat l'affirmait en commentaire et le violait déjà :
    // particleDissolve durait 40 images pour une pause de 30. Ici la table se
    // parcourt, donc l'invariant est vérifié au lieu d'être promis. Sans lui,
    // la voix d'une scène joue par-dessus celle de la suivante.
    for (const [transition, duration] of Object.entries(TRANSITION_DURATIONS)) {
      expect(
        duration,
        `${transition} déborde de la pause`
      ).toBeLessThan(POST_NARRATION_PAUSE_SECONDS);
    }
  });

  it('keeps the measured audio length exactly, plus the pause', () => {
    // Le point de toute la migration : plus de conversion en images, donc
    // plus d'arrondi qui dérive contre l'audio réel.
    expect(sceneDurationSeconds({ durationInSeconds: 5.28 })).toBe(
      5.28 + POST_NARRATION_PAUSE_SECONDS
    );
  });

  it('gives a card no pause, having nothing to digest', () => {
    expect(
      sceneDurationSeconds({ durationInSeconds: 2, card: { text: 'Fin' } })
    ).toBe(2);
  });

  it('never goes below the floor', () => {
    expect(sceneDurationSeconds({ durationInSeconds: 0.1, card: {} })).toBe(
      MIN_SCENE_ON_SCREEN_SECONDS
    );
  });

  it('falls back to the default duration for an unknown transition', () => {
    expect(transitionDurationSeconds('glitch')).toBe(0.3);
    expect(transitionDurationSeconds('inventée-par-le-modèle')).toBe(
      TRANSITION_DURATIONS.fade
    );
    expect(transitionDurationSeconds(undefined)).toBe(TRANSITION_DURATIONS.fade);
  });

  it('tells a shader transition from a CSS one', () => {
    expect(isShaderTransition('cinematic-zoom')).toBe(true);
    expect(isShaderTransition('fade')).toBe(false);
    expect(SHADER_TRANSITIONS).toHaveLength(14);
  });

  it('places each scene absolutely, pulled back by its own transition', () => {
    const scenes = [
      { durationInSeconds: 5 },
      { durationInSeconds: 5, effects: { transition: 'black' } },
      { durationInSeconds: 5, effects: { transition: 'glitch' } },
    ];

    const perScene = 5 + POST_NARRATION_PAUSE_SECONDS; // 6 s
    // Hyperframes veut des positions absolues, pas des durées enchaînées.
    // Chaque scène recule de la durée de sa propre transition entrante.
    expect(sceneStartTimes(scenes)).toEqual([
      0,
      perScene - 0.85,
      perScene * 2 - 0.85 - 0.3,
    ]);
    // 16,85 et non 16.849999999999998 : les durées sont arrondies à la
    // milliseconde, sinon le bruit de flottant finit dans le HTML.
    expect(totalDurationSeconds(scenes)).toBe(16.85);
  });

  it('never starts a scene before zero', () => {
    // Une première scène plus courte que la transition de la deuxième ne doit
    // pas produire un data-start négatif : Hyperframes le refuserait.
    const starts = sceneStartTimes([
      { durationInSeconds: 0.1, card: {} },
      { durationInSeconds: 5, effects: { transition: 'ridged-burn' } },
    ]);
    expect(starts.every((start) => start >= 0)).toBe(true);
  });

  it('handles an empty storyboard without producing a zero-length render', () => {
    expect(totalDurationSeconds([])).toBe(MIN_SCENE_ON_SCREEN_SECONDS);
  });

  it('sizes the canvas from the ratio', () => {
    expect(dimensionsFor('16:9')).toEqual({ width: 1920, height: 1080 });
    expect(dimensionsFor('9:16')).toEqual({ width: 1080, height: 1920 });
  });
});

describe('serialising for Hyperframes', () => {
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
    const storyboard = toHyperframesStoryboard(video, [shot({})]);

    expect(storyboard).toMatchObject({
      title: 'Les Amazones',
      ratio: '16:9',
      subtitles: true,
      subtitleStyle: 'karaoke',
      musicVolume: 0.09,
      sfxVolume: 1,
    });
    // La composition n'a plus rien à calculer : dimensions, fps et durée
    // totale sont posés une fois ici.
    expect(storyboard).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 30,
      durationInSeconds: 5.28 + POST_NARRATION_PAUSE_SECONDS,
    });
    expect(storyboard.scenes[0]).toMatchObject({
      id: 1,
      narration: 'Au XVIIe siècle…',
      mediaPath: '1/videos/1/scene-1.jpeg',
      audioPath: '1/videos/1/scene-1.mp3',
      startInSeconds: 0,
      // L'image reste une seconde de plus que la voix : les deux étaient
      // confondus dans l'ancien contrat.
      narrationSeconds: 5.28,
      durationInSeconds: 5.28 + POST_NARRATION_PAUSE_SECONDS,
      effects: { zoom: 'in' },
      sounds: [{ src: 'sounds/sfx/pop.mp3' }],
    });
    expect(storyboard.scenes[0].words).toHaveLength(1);
  });

  it('numbers the scenes positionally, whatever the row ids are', () => {
    const storyboard = toHyperframesStoryboard(video, [
      shot({ id: 91, order: 1 }),
      shot({ id: 12, order: 2 }),
    ]);
    expect(storyboard.scenes.map((scene) => scene.id)).toEqual([1, 2]);
  });

  it('falls back to the project voice, and omits what is unset', () => {
    const storyboard = toHyperframesStoryboard(
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
    // Des données corrompues dans la colonne jsonb ne doivent pas atteindre
    // le renderer telles quelles.
    const storyboard = toHyperframesStoryboard(video, [
      shot({ render: { effects: { zoom: 'sideways' } } as unknown as Shot['render'] }),
    ]);
    expect(storyboard.scenes[0].effects).toBeUndefined();
  });
});
