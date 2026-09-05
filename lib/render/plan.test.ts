import { describe, expect, it } from 'vitest';
import type { HyperframesStoryboard } from '@/lib/storyboard/render';
import { MAX_WORDS_PER_LINE, musicBeats, snapToBeat, wordLines } from './plan';

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

/**
 * Le découpage des sous-titres en lignes.
 *
 * Un mot s'allume et il **reste** — c'est ce qui fait la lecture karaoké. Sur
 * une scène courte, c'est un sous-titre de deux lignes ; sur une vidéo
 * importée de soixante secondes, c'était un mur de deux cents mots. Personne
 * ne l'avait vu parce qu'aucune scène générée n'était assez longue.
 */
describe('wordLines', () => {
  const mots = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      text: `mot${i}`,
      start: i * 0.4,
      duration: 0.35,
    }));

  it('ne découpe pas une scène courte', () => {
    // La garantie de non-régression : sous le seuil, une scène rend exactement
    // ce qu'elle rendait avant ce découpage.
    expect(wordLines(mots(MAX_WORDS_PER_LINE))).toHaveLength(1);
    expect(wordLines(mots(4))[0]).toHaveLength(4);
  });

  it('ne rend rien quand il n y a pas de mot', () => {
    // Sans ça, un conteneur vide serait posé et un tween viserait le vide.
    expect(wordLines([])).toEqual([]);
  });

  it('répartit régulièrement plutôt que par paquets pleins', () => {
    // Vingt mots par neuf donneraient 9, 9, 2 — une dernière ligne orpheline
    // qui saute aux yeux. On veut 7, 7, 6.
    const tailles = wordLines(mots(20)).map((ligne) => ligne.length);
    expect(tailles).toEqual([7, 7, 6]);
    expect(Math.max(...tailles) - Math.min(...tailles)).toBeLessThanOrEqual(1);
  });

  it('garde tous les mots, dans l ordre, sans en perdre un', () => {
    const decoupe = wordLines(mots(200));
    const remis = decoupe.flat();

    // Un mot perdu décalerait visuellement toute la suite de la phrase.
    expect(remis).toHaveLength(200);
    expect(remis.map((m) => m.text)).toEqual(mots(200).map((m) => m.text));
  });

  it('tient aucune ligne au-dessus du seuil', () => {
    for (const total of [10, 19, 37, 200]) {
      for (const ligne of wordLines(mots(total))) {
        expect(ligne.length).toBeLessThanOrEqual(MAX_WORDS_PER_LINE);
      }
    }
  });

  it('ne laisse jamais une ligne orpheline, quel que soit le compte', () => {
    // 109 mots — un vrai transcript de trente secondes — donnaient douze
    // lignes de neuf et une treizième d'UN mot, affichée deux images. Le reste
    // doit se répartir ligne par ligne, pas s'accumuler à la fin.
    const tailles = wordLines(mots(109)).map((ligne) => ligne.length);
    expect(Math.min(...tailles)).toBe(8);
    expect(Math.max(...tailles)).toBe(9);

    for (let total = MAX_WORDS_PER_LINE + 1; total <= 300; total += 1) {
      const t = wordLines(mots(total)).map((ligne) => ligne.length);
      expect(Math.max(...t) - Math.min(...t)).toBeLessThanOrEqual(1);
      expect(t.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});
