import { describe, expect, it } from 'vitest';
import type { HyperframesStoryboard } from '@/lib/storyboard/render';
import { musicBeats, snapToBeat } from './plan';

/**
 * Le calage sur le rythme.
 *
 * Les fiches de `assets/sounds/` portent les secondes où un morceau frappe.
 * Ce fichier vérifie qu'on sait les retrouver quand la musique boucle, et
 * qu'on refuse de déplacer un effet trop loin pour l'accrocher.
 */

const board = (over: Partial<HyperframesStoryboard>): HyperframesStoryboard =>
  ({ durationInSeconds: 60, ...over }) as HyperframesStoryboard;

describe('musicBeats', () => {
  it('répète les pics à chaque tour de boucle', () => {
    // Une nappe de 31 s qui frappe à 13 s frappe aussi à 44 s.
    const beats = musicBeats(
      board({ musicImpacts: [13], musicDurationS: 31 })
    );
    expect(beats).toEqual([13, 44]);
  });

  it('ne dépasse jamais la fin de la vidéo', () => {
    const beats = musicBeats(
      board({ durationInSeconds: 20, musicImpacts: [5, 18], musicDurationS: 10 })
    );
    expect(beats.every((b) => b <= 20)).toBe(true);
  });

  it('rend une liste triée, dont dépend la recherche du plus proche', () => {
    const beats = musicBeats(
      board({ musicImpacts: [27, 5, 13], musicDurationS: 30 })
    );
    expect(beats).toEqual([...beats].sort((a, b) => a - b));
  });

  it('ne rend rien sans musique — onBeat reste alors sans effet', () => {
    expect(musicBeats(board({}))).toEqual([]);
    expect(musicBeats(board({ musicImpacts: [] }))).toEqual([]);
  });

  it('accepte un morceau dont la longueur est inconnue, sans boucler', () => {
    expect(musicBeats(board({ musicImpacts: [4, 2] }))).toEqual([2, 4]);
  });
});

describe('snapToBeat', () => {
  const beats = [2, 5, 5.4, 12];

  it('accroche le pic le plus proche dans la fenêtre', () => {
    expect(snapToBeat(5.2, beats)).toBe(5.4);
    expect(snapToBeat(1.9, beats)).toBe(2);
  });

  it('garde l’instant écrit quand aucun pic n’est assez près', () => {
    // Déplacer un effet d'une seconde pour l'accrocher, c'est lui faire
    // ponctuer autre chose que ce qu'il devait ponctuer.
    expect(snapToBeat(8, beats)).toBe(8);
  });

  it('respecte une fenêtre plus large quand on la demande', () => {
    // 5,4 est à 2,6 s de l'instant, 12 à 4 : c'est bien le plus proche qui
    // gagne, pas le suivant dans l'ordre.
    expect(snapToBeat(8, beats, 4)).toBe(5.4);
  });

  it('ne bouge pas sans le moindre pic', () => {
    expect(snapToBeat(3.3, [])).toBe(3.3);
  });
});
