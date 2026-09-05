import { describe, expect, it } from 'vitest';
import {
  RAMPE_SECONDES,
  SEUIL_DE_REMONTEE_SECONDES,
  enveloppeMusicale,
  type ScenePourDucking,
} from './ducking';

/** Une scène qui parle, posée à la main : on teste l'enveloppe, pas le plan. */
function scene(surcouche: Partial<ScenePourDucking> = {}): ScenePourDucking {
  return {
    startInSeconds: 0,
    narrationSeconds: 5,
    audioPath: 'voice/1.mp3',
    ...surcouche,
  } as ScenePourDucking;
}

const REGLAGES = { volume: 0.08, ducking: 0.5, dureeTotale: 30 };

/** Le volume à un instant, comme HyperFrames l'interpole : linéairement. */
function volumeA(points: { time: number; volume: number }[], t: number): number {
  const apres = points.findIndex((p) => p.time > t);
  if (apres <= 0) return points[apres === 0 ? 0 : points.length - 1].volume;

  const a = points[apres - 1];
  const b = points[apres];
  const span = b.time - a.time;
  return span <= 0 ? b.volume : a.volume + ((b.volume - a.volume) * (t - a.time)) / span;
}

describe('quand il n y a rien à faire', () => {
  it('ne rend aucun point sans ducking demandé', () => {
    // Un tableau vide veut dire « garde le volume constant » : c'est le bon
    // comportement, pas un repli.
    expect(enveloppeMusicale([scene()], { ...REGLAGES, ducking: 0 })).toEqual([]);
  });

  it('ne rend aucun point sans musique à baisser', () => {
    expect(enveloppeMusicale([scene()], { ...REGLAGES, volume: 0 })).toEqual([]);
  });

  it('ne rend aucun point quand personne ne parle', () => {
    // Une scène sans voix off ni son de média : il n'y a rien sous quoi
    // passer.
    const muette = scene({ audioPath: undefined, mediaVolume: 0 });
    expect(enveloppeMusicale([muette], REGLAGES)).toEqual([]);
  });
});

describe('l enveloppe d une seule voix', () => {
  const points = enveloppeMusicale([scene({ startInSeconds: 4, narrationSeconds: 6 })], REGLAGES);

  it('part en haut, descend sous la voix, remonte après', () => {
    expect(volumeA(points, 0)).toBeCloseTo(0.08, 5);
    // Sous la voix : moitié du lit, c'est ce que `explainer` demande.
    expect(volumeA(points, 7)).toBeCloseTo(0.04, 5);
    expect(volumeA(points, 10 + RAMPE_SECONDES + 0.1)).toBeCloseTo(0.08, 5);
  });

  it('descend en rampe et pas en marche', () => {
    // Une descente instantanée fait un clic audible sur un lit continu.
    const milieu = volumeA(points, 4 - RAMPE_SECONDES / 2);
    expect(milieu).toBeLessThan(0.08);
    expect(milieu).toBeGreaterThan(0.04);
  });

  it('a fini de descendre quand le premier mot tombe', () => {
    // L'inverse couvrirait le début de la phrase, ce qui est précisément ce
    // que le ducking existe pour éviter.
    expect(volumeA(points, 4)).toBeCloseTo(0.04, 5);
  });
});

describe('le pompage', () => {
  /*
   * Deux scènes séparées par la respiration d'une seconde du moteur.
   *
   * Elles ne partent pas de zéro : une vidéo qui commence à parler dès la
   * première image n'a pas de descente à jouer — le lit démarre déjà baissé —
   * et on ne verrait donc pas si la fusion marche.
   */
  const collees = [
    scene({ startInSeconds: 2, narrationSeconds: 5 }),
    scene({ startInSeconds: 8, narrationSeconds: 5 }),
  ];

  it('ne remonte pas entre deux scènes qui se suivent', () => {
    // Chaque scène est suivie d'une respiration d'une seconde. Remonter puis
    // redescendre à chacune ferait respirer la musique une fois par plan, ce
    // qui s'entend beaucoup plus qu'un lit qui reste sous la voix.
    const points = enveloppeMusicale(collees, REGLAGES);
    expect(volumeA(points, 7.5)).toBeCloseTo(0.04, 5);
  });

  it('remonte quand le silence est voulu', () => {
    // Au-delà du seuil, ce n'est plus une respiration mais un blanc écrit.
    const espacees = [
      scene({ startInSeconds: 0, narrationSeconds: 5 }),
      scene({ startInSeconds: 5 + SEUIL_DE_REMONTEE_SECONDES + 2, narrationSeconds: 5 }),
    ];
    const points = enveloppeMusicale(espacees, REGLAGES);

    expect(volumeA(points, 5 + SEUIL_DE_REMONTEE_SECONDES + 0.5)).toBeCloseTo(0.08, 5);
  });

  it('fusionne en une seule descente et une seule remontée', () => {
    // La forme plutôt qu'un compte : c'est le nombre de mouvements qui
    // s'entend, pas le nombre de points. Deux scènes collées ne doivent
    // produire qu'un seul aller-retour.
    const points = enveloppeMusicale(collees, REGLAGES);
    let descentes = 0;
    let remontees = 0;

    for (let i = 1; i < points.length; i += 1) {
      if (points[i].volume < points[i - 1].volume) descentes += 1;
      if (points[i].volume > points[i - 1].volume) remontees += 1;
    }

    expect(descentes).toBe(1);
    expect(remontees).toBe(1);
  });
});

describe('les bornes', () => {
  it('ne sort jamais de la vidéo', () => {
    const points = enveloppeMusicale(
      [scene({ startInSeconds: 0, narrationSeconds: 30 })],
      REGLAGES
    );

    for (const point of points) {
      expect(point.time).toBeGreaterThanOrEqual(0);
      expect(point.time).toBeLessThanOrEqual(30);
    }
  });

  it('baisse dès la première image quand la voix commence à zéro', () => {
    // La rampe tomberait avant le début de la vidéo. Bornée à zéro, elle
    // tombe sur la descente : un seul point, en bas — il n'y a rien à
    // descendre depuis, et le premier mot ne doit pas être couvert.
    const points = enveloppeMusicale([scene({ startInSeconds: 0 })], REGLAGES);

    expect(points.filter((p) => p.time === 0)).toHaveLength(1);
    expect(points[0].volume).toBeCloseTo(0.04, 5);
  });

  it('reste dans [0, 1] même avec un ducking total', () => {
    const points = enveloppeMusicale([scene()], { ...REGLAGES, ducking: 1 });

    for (const point of points) {
      expect(point.volume).toBeGreaterThanOrEqual(0);
      expect(point.volume).toBeLessThanOrEqual(1);
    }
    expect(Math.min(...points.map((p) => p.volume))).toBe(0);
  });
});

describe('ce qui fait parler une scène', () => {
  it('compte la bande son d un média importé, pas seulement la voix off', () => {
    // Le cas d'usage de la vidéo apportée par le client : la bande son EST la
    // sienne. Une musique qui ne baisserait pas sous elle se battrait avec.
    const importee = scene({ audioPath: undefined, mediaVolume: 1 });
    expect(enveloppeMusicale([importee], REGLAGES).length).toBeGreaterThan(0);
  });

  it('borne la voix à sa longueur, pas à celle de la scène', () => {
    // `narrationSeconds` est l'audio ; la durée de la scène comprend la
    // respiration de fin, pendant laquelle plus personne ne parle.
    const points = enveloppeMusicale(
      [scene({ startInSeconds: 0, narrationSeconds: 4 })],
      REGLAGES
    );
    const remontee = points.find((p) => p.time > 4 && p.volume > 0.05);

    expect(remontee?.time).toBeCloseTo(4 + RAMPE_SECONDES, 5);
  });
});
