import { describe, expect, it } from 'vitest';
import type { Shot, Video } from '@/lib/db/schema';
import {
  MOVE_TRANSITIONS,
  TRANSITION_DURATIONS,
  toHyperframesStoryboard,
} from '@/lib/storyboard/render';
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

    /*
     * Le silence est le danger de cette table : la boucle passe son chemin sur
     * un geste qu'elle ne connaît pas. Un nom offert au modèle sans forme
     * derrière rendrait une coupe sèche, sans rien casser ni rien dire.
     */
    it('gives every declared movement a shape and a duration', () => {
      const page = withTransition('push-left');
      const script = page.slice(page.lastIndexOf('<script>'));
      const table = script.slice(script.indexOf('const MOVES = {'));

      for (const kind of MOVE_TRANSITIONS) {
        expect(table).toContain(`"${kind}":`);
        expect(TRANSITION_DURATIONS[kind]).toBeGreaterThan(0);
      }
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

    it('carries the hoisted clip with its scene', () => {
      // Un plan animé a son element video hors du div de scène : déplacer le
      // div ne déplace pas le clip. Sans ça une poussée faisait glisser les
      // sous-titres pendant que l'image restait immobile.
      const page = withTransition('push-left');
      const script = page.slice(page.lastIndexOf('<script>'));
      expect(script).toContain('"#m" + move.from');
      expect(script).toContain('"#m" + move.to');
    });

    it('drives every movement from an absolute instant', () => {
      const page = withTransition('zoom-through');
      const script = page.slice(page.lastIndexOf('<script>'));
      expect(script).not.toMatch(/\btl\.to\(/);
    });
  });

  describe('the title variants', () => {
    const titled = (variant: string) =>
      html([
        {
          ...shot(),
          render: { kineticTitle: { text: 'DEUX MOTS', variant } },
        } as Shot,
      ]);

    it('animates letters for the three that need them, words otherwise', () => {
      // Les lettres sont enveloppées dans leur mot : sans ça un titre se
      // couperait au milieu d'un mot en fin de ligne.
      expect(titled('typewriter')).toContain('class="kt-char"');
      expect(titled('slam')).not.toContain('class="kt-char"');
    });

    it('computes its targets outside the page', () => {
      const page = titled('cascade');
      const T = JSON.parse(/const T = (\{.*?\});/s.exec(page)![1]);
      // « DEUX MOTS » : quatre lettres puis quatre lettres.
      expect(T.scenes[0].kinetic.cibles).toHaveLength(8);
      expect(T.scenes[0].kinetic.cibles[0]).toBe('k0-0-0');
    });

    it('targets words when the variant animates words', () => {
      const page = titled('slam');
      const T = JSON.parse(/const T = (\{.*?\});/s.exec(page)![1]);
      expect(T.scenes[0].kinetic.cibles).toEqual(['k0-0', 'k0-1']);
    });

    it('emits a gesture for every variant the contract accepts', () => {
      const script = titled('reveal').slice(titled('reveal').lastIndexOf('<script>'));
      // Une variante déclarée au contrat mais absente de la table retomberait
      // en `reveal` sans que rien ne le signale.
      const declarees = [
        'reveal', 'neon', 'icon', 'pin', 'typewriter', 'tracking', 'cascade',
        'slam', 'rise', 'glitch', 'blur-out', 'explode', 'focus', 'lines',
        'lockup', 'decode', 'crossfade', 'scan', 'axis-y', 'axis-z', 'reel',
        'fade-up', 'strike', 'ticker', 'calm', 'split', 'weight', 'wave',
        'backdrop', 'drop',
      ];
      for (const v of declarees) {
        const cle = /^[a-z]+$/.test(v) ? `${v}: {` : `"${v}": {`;
        expect(script, v).toContain(cle);
      }
    });
  });

  describe('the caption styles', () => {
    const styled = (subtitleStyle: string, emphasis?: string[]) =>
      html([{ ...shot(), render: emphasis ? { emphasis } : {} } as Shot], {
        video: { ...video, subtitleStyle } as Video,
      });

    it('emits a gesture for every style the enum accepts', () => {
      // Un style absent de la table retomberait en karaoké sans rien dire.
      const script = styled('karaoke').slice(styled('karaoke').lastIndexOf('<script>'));
      for (const style of ['karaoke', 'fondant', 'highlight', 'pill', 'wipe', 'neon', 'gradient', 'blend']) {
        expect(script).toContain(`${style}: {`);
      }
    });

    it('marks the words the scene says carry the meaning', () => {
      // « Une phrase de trois mots. » — `trois` est le quatrième.
      const page = styled('highlight', ['trois']);
      expect(page).toMatch(/<span class="word fort" id="w0-3">/);
      expect(page).toMatch(/<span class="word" id="w0-0">/);
    });

    it('compares emphasis without case or punctuation', () => {
      // Le modèle écrit « Dahomey », le mot rendu peut être « Dahomey, ».
      const page = html(
        [{ ...shot({ narration: 'le Dahomey, tombe' }), render: { emphasis: ['dahomey'] } } as Shot],
        { video: { ...video, subtitleStyle: 'pill' } as Video }
      );
      expect(page).toContain('class="word fort"');
    });

    it('carries one emoji when the scene poses one', () => {
      const page = html([{ ...shot(), render: { emoji: '🔥' } } as Shot]);
      expect(page).toContain('class="word-emoji"');
      expect(html([shot()])).not.toContain('word-emoji');
    });
  });

  describe('the per-scene subtitle switch', () => {
    it('lets a scene refuse subtitles the video otherwise shows', () => {
      // Un titre plein cadre ou un plan de respiration n'a pas à porter du
      // texte parce que le reste de la vidéo en porte.
      const page = html([{ ...shot(), render: { showSubtitles: false } } as Shot]);
      expect(page).not.toContain('class="captions');
      expect(page).not.toContain('class="veil"');
    });

    it('leaves the karaoke tweens out too, or they aim at nothing', () => {
      const page = html([{ ...shot(), render: { showSubtitles: false } } as Shot]);
      const T = JSON.parse(/const T = (\{.*?\});/s.exec(page)![1]);
      expect(T.scenes[0].words).toEqual([]);
    });

    it('follows the video when the scene says nothing', () => {
      expect(html([shot()])).toContain('class="captions');
    });
  });

  describe('the vertical safe area', () => {
    const bottom = (page: string) =>
      Number(/\.captions \{[^}]*bottom: ([\d.]+)%/.exec(page)?.[1]);

    it('keeps the subtitles clear of the platform interface in 9:16', () => {
      // TikTok, Reels et Shorts posent leur légende et leurs boutons sur le bas
      // du cadre. Un sous-titre à 9 % passe dessous, et ça ne se voit sur aucun
      // rendu — seulement une fois publié.
      const vertical = html([shot()], {
        video: { ...video, ratio: '9:16' } as Video,
      });
      expect(bottom(vertical)).toBeGreaterThan(15);
    });

    it('ne perd pas de place en 16:9, où la vidéo occupe tout l’écran', () => {
      expect(bottom(html([shot()]))).toBeLessThan(12);
    });
  });

  describe('effects on the beat', () => {
    const onBeatPage = (onBeat: boolean) =>
      composeHtml({
        storyboard: {
          ...toHyperframesStoryboard(video, [
            {
              ...shot(),
              render: {
                effects: {
                  onBeat,
                  flash: { startInSeconds: 1.2, durationInSeconds: 0.2 },
                },
              },
            } as Shot,
          ]),
          musicImpacts: [1.35],
          musicDurationS: 30,
        },
      });

    it('moves the flash onto the nearest impact when asked', () => {
      const T = JSON.parse(/const T = (\{.*?\});/s.exec(onBeatPage(true))![1]);
      expect(T.scenes[0].flash.at).toBe(1.35);
    });

    it('leaves the written instant alone otherwise', () => {
      const T = JSON.parse(/const T = (\{.*?\});/s.exec(onBeatPage(false))![1]);
      expect(T.scenes[0].flash.at).toBe(1.2);
    });
  });

  describe('the scene sounds', () => {
    const withSounds = (sounds: unknown[]) =>
      html([{ ...shot(), render: { sounds } } as Shot]);

    it('gives every sound its own id, or the track is dropped', () => {
      // Le moteur découvre les médias par leur id : sans lui, la piste est
      // ignorée et la vidéo sort sans le son, en silence et sans erreur.
      const page = withSounds([{ src: 'sounds/sfx/pop.mp3' }, { src: 'sounds/amb/vent.mp3' }]);
      expect(page).toContain('id="sfx-0-0"');
      expect(page).toContain('id="sfx-0-1"');
    });

    it('never puts two sounds of a scene on the same track', () => {
      const page = withSounds([{ src: 'a.mp3' }, { src: 'b.mp3' }]);
      const pistes = [...page.matchAll(/id="sfx-0-\d" [^>]*data-track-index="(\d+)"/g)]
        .map((m) => Number(m[1]));
      expect(new Set(pistes).size).toBe(pistes.length);
    });

    it('multiplies the scene volume by the video sfx level', () => {
      const page = html([{ ...shot(), render: { sounds: [{ src: 'a.mp3', volume: 0.5 }] } } as Shot], {
        video: { ...video, sfxVolume: 0.4 } as Video,
      });
      expect(page).toContain('data-volume="0.2"');
    });

    it('cuts a sound with the scene it punctuates', () => {
      // Un son n'a pas à survivre au plan : sa durée est ce qu'il reste de la
      // scène après son décalage.
      const page = withSounds([{ src: 'a.mp3', startInSeconds: 1 }]);
      const found = /id="sfx-0-0"[^>]*data-duration="([\d.]+)"/.exec(page);
      expect(Number(found?.[1])).toBeCloseTo(4, 3);
    });

    it('carries the loop flag through', () => {
      expect(withSounds([{ src: 'a.mp3', loop: true }])).toMatch(/id="sfx-0-0"[^>]*loop/);
      expect(withSounds([{ src: 'a.mp3' }])).not.toMatch(/id="sfx-0-0"[^>]*loop/);
    });

    it('fades through the timeline, since the engine only knows a fixed volume', () => {
      const page = withSounds([{ src: 'a.mp3', fadeInSeconds: 0.5, fadeOutSeconds: 0.3 }]);
      const script = page.slice(page.lastIndexOf('<script>'));
      expect(script).toContain('for (const son of T.sfx)');
      expect(script).toContain('{ volume: 0 }');
    });

    it('declares no fade when none was asked for', () => {
      const page = withSounds([{ src: 'a.mp3' }]);
      const T = JSON.parse(/const T = (\{.*?\});/s.exec(page)![1]);
      expect(T.sfx).toEqual([]);
    });
  });

  describe('the counter', () => {
    const withCounter = (counter: Record<string, unknown>) =>
      html([{ ...shot(), render: { counter } } as Shot]);

    it('shows the value it lands on, not the one it starts from', () => {
      // Une timeline qui ne jouerait pas laisserait le bon chiffre à l'écran,
      // immobile. C'est la panne la moins mauvaise.
      const page = withCounter({ value: 6000, label: 'soldates' });
      expect(page).toContain('>6000</div>');
      expect(page).toContain('soldates');
    });

    it('carries prefix, suffix and decimals into the markup', () => {
      const page = withCounter({
        value: 41.5,
        decimals: 1,
        prefix: '+',
        suffix: ' %',
      });
      expect(page).toContain('+41.5 %');
    });

    it('animates a plain object, never an incrementing counter', () => {
      // Incrémenter à chaque appel donnerait une vidéo différente à chaque
      // rendu : le moteur cherche les images, il ne les joue pas dans l'ordre.
      const page = withCounter({ value: 100 });
      const script = page.slice(page.lastIndexOf('<script>'));
      expect(script).toContain('const state = { v: scene.counter.from }');
      expect(script).toContain('state.v.toFixed');
    });

    it('drives the ring through a CSS variable, not through geometry', () => {
      const page = withCounter({ value: 80, variant: 'ring' });
      // La classe de l'anneau diffère du modificateur de variante : sous le
      // même nom, le conteneur héritait de la taille de son enfant.
      expect(page).toContain('class="counter-dial"');
      expect(page).toContain('counter counter-ring');
      const script = page.slice(page.lastIndexOf('<script>'));
      expect(script).toContain('--fill');
    });

    it('leaves the page alone when no scene asks for one', () => {
      expect(html([shot()])).not.toContain('class="counter');
    });
  });

  describe('the lower third', () => {
    const withTiers = (lowerThird: Record<string, unknown>) =>
      html([{ ...shot(), render: { lowerThird } } as Shot]);

    it('keeps the name and the role as two elements, never one string', () => {
      // C'est toute la raison d'être du champ : le CSS ne peut hiérarchiser
      // que ce qui lui arrive séparé.
      const page = withTiers({ name: 'Kofi Mensah', role: 'agronome' });
      expect(page).toContain('<div class="lt-name">Kofi Mensah</div>');
      expect(page).toContain('<div class="lt-role">agronome</div>');
    });

    it('omits the second line when the scene gives no role', () => {
      expect(withTiers({ name: 'Cotonou' })).not.toContain('lt-role');
    });

    it('poses the variant and the side as classes', () => {
      const page = withTiers({ name: 'X', variant: 'boxed', side: 'right' });
      expect(page).toContain('lower-third lt-boxed lt-right');
    });

    it('enters from the edge it sits against', () => {
      const T = (page: string) =>
        JSON.parse(/const T = (\{.*?\});/s.exec(page)![1]);
      expect(T(withTiers({ name: 'X', side: 'right' })).scenes[0].lowerThird.dx)
        .toBe(40);
      expect(T(withTiers({ name: 'X' })).scenes[0].lowerThird.dx).toBe(-40);
    });

    it('leaves before the scene does, and never after it', () => {
      // Un tiers qui survit à son plan nomme quelqu'un d'autre sur le suivant.
      const page = withTiers({ name: 'X', holdSeconds: 999 });
      const T = JSON.parse(/const T = (\{.*?\});/s.exec(page)![1]);
      const scene = T.scenes[0];
      expect(scene.lowerThird.out).toBeLessThanOrEqual(
        scene.start + scene.duration
      );
    });

    it('leaves the page alone when no scene asks for one', () => {
      expect(html([shot()])).not.toContain('lower-third');
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
