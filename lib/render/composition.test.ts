import { describe, expect, it } from 'vitest';
import type { Shot, Video } from '@/lib/db/schema';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import {
  composeHtml,
  fadeInSeconds,
  kenBurns,
  lightsWords,
  subtitleStyleOf,
  wordsOrFallback,
} from './composition';

function shot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 1,
    order: 1,
    type: 'image',
    prompt: 'a baobab',
    narration: 'Une phrase de trois mots.',
    subtitle: null,
    audioUrl: 'voice/scene-1.mp3',
    assetUrl: 'media/scene-1.jpg',
    durationS: 4,
    durationSource: 'measured',
    words: null,
    render: {},
    ...overrides,
  } as unknown as Shot;
}

const video = {
  title: 'Les Amazones',
  ratio: '16:9',
  resolution: '480p',
  voice: null,
  subtitles: true,
  subtitleStyle: 'karaoke',
  musicUrl: null,
  musicVolume: 0.09,
  sfxVolume: 1,
} as unknown as Video;

const html = (shots: Shot[], options?: { watermark?: boolean; video?: Video }) =>
  composeHtml({
    storyboard: toHyperframesStoryboard(options?.video ?? video, shots),
    watermark: options?.watermark,
  });

describe('the composition HyperFrames renders', () => {
  it('gives every audio element an id, or the video comes out silent', () => {
    // Le moteur découvre les médias par leur id. Sans id, la piste est
    // ignorée — et aucune erreur n'est levée : on obtient une vidéo muette
    // qu'on a payée. `hyperframes check` l'a trouvé avant le premier rendu.
    const page = html([shot(), shot({ id: 2, order: 2 })]);

    const audios = page.match(/<audio[^>]*>/g) ?? [];
    expect(audios).toHaveLength(2);
    for (const tag of audios) {
      expect(tag, tag).toMatch(/\bid="/);
    }
  });

  it('never puts a scene on the background track', () => {
    // Deux clips qui se chevauchent sur la même piste sont un conflit de
    // rendu, et le fond couvre toute la vidéo : il chevauche donc forcément
    // la première scène.
    const page = html([shot(), shot({ id: 2, order: 2 })]);

    const background = /<div id="bg"[^>]*data-track-index="(\d+)"/.exec(page);
    expect(background?.[1]).toBe('0');

    const sceneTracks = [...page.matchAll(/class="scene clip"[^>]*data-track-index="(\d+)"/g)]
      .map((match) => Number(match[1]));
    expect(sceneTracks).toEqual([1, 2]);
  });

  it('cuts the voice at the end of the phrase, not the end of the scene', () => {
    // L'image reste à l'écran après la phrase, la voix non. Les confondre
    // fait jouer la voix d'une scène par-dessus la suivante.
    const page = html([shot({ durationS: 4 })]);

    const audio = /<audio id="voice-0"[^>]*data-duration="([\d.]+)"/.exec(page);
    const scene = /class="scene clip"[^>]*data-duration="([\d.]+)"/.exec(page);

    expect(Number(audio?.[1])).toBe(4);
    // La scène tient une seconde de plus : la pause après narration.
    expect(Number(scene?.[1])).toBe(5);
  });

  it('positions every scene on the absolute timeline', () => {
    const page = html([
      shot({ durationS: 4, render: { effects: { transition: 'none' } } }),
      shot({ id: 2, order: 2, durationS: 3, render: { effects: { transition: 'fade' } } }),
    ]);

    const starts = [...page.matchAll(/class="scene clip"[^>]*data-start="([\d.]+)"/g)]
      .map((match) => Number(match[1]));

    expect(starts[0]).toBe(0);
    // La deuxième est tirée en arrière de sa propre transition, pour que le
    // fondu ait de la matière des deux côtés.
    expect(starts[1]).toBeLessThan(5);
    expect(starts[1]).toBeGreaterThan(4);
  });

  it('drives every animation from a declared instant, never an accumulated one', () => {
    // Le moteur cherche chaque image au lieu de jouer. `to` part de l'état
    // courant, donc d'un état faux après un saut arrière. Seul `fromTo`
    // survit.
    const page = html([shot()]);
    const script = page.slice(page.lastIndexOf('<script>'));

    expect(script).toContain('gsap.timeline({ paused: true })');
    expect(script).toContain('tl.fromTo(');
    expect(script).not.toMatch(/\btl\.to\(/);
    expect(script).toContain('window.__timelines["main"]');
  });

  it('lights one span per word so a word can carry its own timing', () => {
    const page = html([
      shot({
        narration: 'Trois mots ici',
        words: [
          { text: 'Trois', start: 0, duration: 0.4 },
          { text: 'mots', start: 0.4, duration: 0.4 },
          { text: 'ici', start: 0.8, duration: 0.4 },
        ],
      }),
    ]);

    expect(page).toContain('id="w0-0"');
    expect(page).toContain('id="w0-2"');
    expect(page).not.toContain('id="w0-3"');
  });

  it('escapes what the customer wrote', () => {
    const page = html([
      shot({
        narration: '<script>alert(1)</script>',
        words: [{ text: '<script>x</script>', start: 0, duration: 1 }],
      }),
    ]);

    // Le titre et la narration viennent de l'utilisateur. Une balise qui
    // passe se retrouve exécutée dans le Chrome de rendu.
    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).toContain('&lt;script&gt;');
  });

  it('never lets a title close the script tag from inside a string', () => {
    const page = html([shot()], {
      video: { ...video, title: '</script><script>alert(1)</script>' } as Video,
    });
    const script = page.slice(page.lastIndexOf('<script>'));
    expect(script).not.toContain('alert(1)');
  });

  it('scales the subtitles with the frame, not in absolute pixels', () => {
    const small = html([shot()]);
    const large = html([shot()], {
      video: { ...video, resolution: '720p' } as Video,
    });

    const size = (page: string) =>
      Number(/\.captions \{ font-size: (\d+)px/.exec(page)?.[1]);

    expect(size(small)).toBeGreaterThan(0);
    expect(size(large)).toBeGreaterThan(size(small));
  });

  it('adds the watermark only when it was paid for', () => {
    expect(html([shot()], { watermark: true })).toContain('id="watermark"');
    expect(html([shot()], { watermark: false })).not.toContain('id="watermark"');
  });

  it('omits the subtitles entirely when the video turns them off', () => {
    const page = html([shot()], {
      video: { ...video, subtitles: false } as Video,
    });
    expect(page).not.toContain('class="captions');
    expect(page).not.toContain('class="veil"');
    // Le test resterait vert sans cette ligne : la classe porte un suffixe de
    // style, donc il faut vérifier qu'elle est là quand elle doit y être.
    expect(html([shot()])).toContain('class="captions');
  });

  describe('the transform transitions', () => {
    const withTransition = (transition: string) =>
      html([
        shot(),
        { ...shot(), id: 2, order: 2, render: { effects: { transition } } } as Shot,
      ]);

    it('moves both scenes, not just the one arriving', () => {
      const page = withTransition('push-left');
      const script = page.slice(page.lastIndexOf('<script>'));
      // La scène 0 sort, la scène 1 entre : les deux doivent être pilotées.
      expect(script).toContain('"#s" + move.from');
      expect(script).toContain('"#s" + move.to');
      expect(script).toContain('"push-left"');
    });

    const asScene = (transition: string) =>
      ({ effects: { transition } }) as never;

    it('never fades a scene that arrives by sliding', () => {
      // Un fondu par-dessus une poussée rendrait la scène fantomatique
      // pendant tout son trajet.
      expect(fadeInSeconds(asScene('push-left'), 1)).toBe(0);
      expect(fadeInSeconds(asScene('squeeze'), 1)).toBe(0);
      expect(fadeInSeconds(asScene('fade'), 1)).toBeGreaterThan(0);
    });

    it('keeps the compositor holding both scenes open', () => {
      const page = withTransition('push-up');
      const cuts = JSON.parse(
        /const T = (\{.*?\});/s.exec(page)![1]
      ).cuts as { duration: number; shader?: string }[];
      // La couture garde sa vraie durée : c'est elle qui maintient les deux
      // scènes vivantes pendant le geste. Une durée nulle ferait sauter le
      // compositeur à l'état d'après, et la sortante disparaîtrait.
      expect(cuts.at(-1)!.duration).toBeGreaterThan(0);
      expect(cuts.at(-1)).not.toHaveProperty('shader');
    });

    it('writes the movement after the compositor, never before', () => {
      // Le moteur cherche chaque image, et les deux systèmes écrivent sur les
      // mêmes propriétés : le dernier gagne. Posé avant, le geste est effacé.
      const page = withTransition('push-left');
      expect(page.indexOf('HyperShader.init')).toBeLessThan(
        page.indexOf('for (const move of T.moves)')
      );
    });

    it('re-asserts visibility, which opacity alone would not restore', () => {
      const page = withTransition('push-left');
      const script = page.slice(page.lastIndexOf('<script>'));
      expect(script).toContain('visibility: "visible"');
    });

    it('drives every movement from an absolute instant', () => {
      const page = withTransition('zoom-through');
      const script = page.slice(page.lastIndexOf('<script>'));
      expect(script).not.toMatch(/\btl\.to\(/);
    });
  });

  describe('the three subtitle styles', () => {
    const styled = (subtitleStyle: string) =>
      html([shot()], { video: { ...video, subtitleStyle } as Video });

    it('marks the caption block with the style the video chose', () => {
      expect(styled('karaoke')).toContain('captions captions-karaoke');
      expect(styled('fondant')).toContain('captions captions-fondant');
      expect(styled('cinematic')).toContain('captions captions-cinematic');
    });

    it('lights one word at a time for karaoke and fondant', () => {
      // Trois mots dans la narration de `shot()`, donc trois tweens de mot.
      for (const style of ['karaoke', 'fondant']) {
        const script = styled(style).slice(styled(style).lastIndexOf('<script>'));
        expect(script).toContain('"#w" + scene.index + "-" + i');
      }
    });

    it('reveals the whole line at once for cinematic', () => {
      const page = styled('cinematic');
      const script = page.slice(page.lastIndexOf('<script>'));
      expect(script).toContain('"cinematic"');
      expect(page).toContain('id="c0"');
    });

    it('falls back to karaoke, which is what already-rendered videos got', () => {
      expect(subtitleStyleOf({})).toBe('karaoke');
      expect(subtitleStyleOf({ subtitleStyle: null })).toBe('karaoke');
      expect(subtitleStyleOf({ subtitleStyle: 'fondant' })).toBe('fondant');
    });

    it('knows which styles animate word by word', () => {
      expect(lightsWords('karaoke')).toBe(true);
      expect(lightsWords('fondant')).toBe(true);
      expect(lightsWords('cinematic')).toBe(false);
    });
  });

  it('declares the frame the resolution is billed at', () => {
    const page = html([shot()]);
    expect(page).toContain('data-width="848"');
    expect(page).toContain('data-height="480"');
  });
});

describe('the slow zoom', () => {
  it('zooms in by default, out on request', () => {
    expect(kenBurns('in')).toEqual({ from: 1, to: 1.06 });
    expect(kenBurns('out')).toEqual({ from: 1.06, to: 1 });
    expect(kenBurns(undefined)).toEqual({ from: 1, to: 1.06 });
  });

  it('keeps a trace of movement even on "none"', () => {
    // Une image parfaitement immobile au milieu de plans qui bougent se lit
    // comme une image figée, pas comme un choix.
    const still = kenBurns('none');
    expect(still.from).not.toBe(still.to);
  });
});

describe('the incoming fade', () => {
  const scene = (transition?: string) =>
    ({ effects: transition ? { transition } : undefined }) as never;

  it('gives the first scene no fade — there is nothing under it', () => {
    expect(fadeInSeconds(scene('fade'), 0)).toBe(0);
  });

  it('honours a hard cut', () => {
    expect(fadeInSeconds(scene('none'), 1)).toBe(0);
  });

  it('falls back to a fade for a shader transition rather than failing', () => {
    // Les 14 transitions shader demandent le paquet et un canvas WebGL. Tant
    // qu'il n'est pas installé, un fondu vaut mieux qu'un rendu perdu.
    expect(fadeInSeconds(scene('whip-pan'), 1)).toBeGreaterThan(0);
  });
});

describe('subtitles without an alignment', () => {
  it('spreads the words evenly, visibly worse than a real alignment', () => {
    const words = wordsOrFallback({
      narration: 'un deux trois quatre',
      narrationSeconds: 4,
    } as never);

    expect(words.map((word) => word.text)).toEqual([
      'un',
      'deux',
      'trois',
      'quatre',
    ]);
    expect(words[0].start).toBe(0);
    expect(words[3].start).toBe(3);
  });

  it('prefers the real alignment whenever it exists', () => {
    const real = [{ text: 'un', start: 0.11, duration: 0.3 }];
    expect(
      wordsOrFallback({ words: real, narration: 'un deux' } as never)
    ).toBe(real);
  });

  it('returns nothing for a scene with no line at all', () => {
    expect(
      wordsOrFallback({ narration: '   ', narrationSeconds: 3 } as never)
    ).toEqual([]);
  });
});
