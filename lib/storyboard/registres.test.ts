import { describe, expect, it } from 'vitest';
import { sceneEffectsSchema } from '@/lib/storyboard/render';
import {
  REGISTRES,
  TONS,
  audioDe,
  bornesDeNarration,
  dureeMinDe,
  habille,
  lignesDesRegistres,
  qualiteDe,
  styleDe,
  transitionsDe,
  voixDe,
} from '@/lib/storyboard/registres';

/** Une vidéo assez longue pour que le milieu ne soit ni l'ouverture ni la fin. */
const TOTAL = 6;

describe('ce que la table produit', () => {
  it('rend des effets que le contrat de rendu accepte', () => {
    // Le contrat borne `beatAccent.strength` à 0,06 ; la table écrivait 0,35,
    // et `sceneRenderSchema` rejetait alors le plan entier — la scène perdait
    // tous ses effets, silencieusement, sur une seule valeur hors bornes.
    for (const registre of REGISTRES) {
      for (const ton of TONS) {
        for (let index = 0; index < TOTAL; index += 1) {
          expect(() =>
            sceneEffectsSchema.parse(habille(registre, ton, index, TOTAL))
          ).not.toThrow();
        }
      }
    }
  });

  it('alterne le zoom au milieu et ne pose un accent que sur un appui', () => {
    expect(habille('explainer', 'pose', 2, TOTAL).zoom).toBe('in');
    expect(habille('explainer', 'pose', 3, TOTAL).zoom).toBe('out');
    expect(habille('explainer', 'pose', 2, TOTAL).beatAccent).toBeUndefined();
    expect(habille('explainer', 'appui', 2, TOTAL).beatAccent).toBeDefined();
  });

  it('ouvre sans transition et ferme au noir', () => {
    const ouverture = habille('explainer', 'pose', 0, TOTAL);
    const fermeture = habille('explainer', 'pose', TOTAL - 1, TOTAL);

    // Rien sous la première scène : une transition n'aurait rien à mélanger.
    expect(ouverture.transition).toBe('none');
    expect(ouverture.cameraMotion).toBe('dolly');
    expect(fermeture.transition).toBe('black');
    expect(fermeture.zoom).toBe('out');
  });

  it('donne la place le dernier mot sur le ton', () => {
    // Une phrase qui appuie sur le premier plan reste une ouverture : sinon la
    // vidéo commencerait par un fondu depuis rien.
    expect(habille('explainer', 'appui', 0, TOTAL).transition).toBe('none');
    expect(habille('explainer', 'bascule', TOTAL - 1, TOTAL).transition).toBe('black');
  });

  it('garde un mouvement par intention, et le repos majoritaire', () => {
    expect(habille('explainer', 'pose', 2, TOTAL).cameraMotion).toBe('static');
    expect(habille('explainer', 'appui', 2, TOTAL).cameraMotion).toBe('dolly');
    expect(habille('explainer', 'bascule', 2, TOTAL).cameraMotion).toBe('pan');
    expect(habille('explainer', 'pose', TOTAL - 1, TOTAL).cameraMotion).toBe('orbit');
  });

  it('tient sur une vidéo d une seule scène', () => {
    // Elle est à la fois l'ouverture et la fermeture : l'ouverture gagne, sinon
    // la seule scène de la vidéo s'ouvrirait sur un noir.
    expect(habille('explainer', 'pose', 0, 1).transition).toBe('none');
  });

  it('ne rend que des transitions de sa propre liste blanche', () => {
    // La liste ne vaut que par ce test : sans lui, une fiche pourrait écrire
    // une transition qui jure avec son registre et personne ne le verrait.
    for (const registre of REGISTRES) {
      const autorisees = new Set(transitionsDe(registre));
      for (const ton of TONS) {
        for (let index = 0; index < TOTAL; index += 1) {
          const rendue = habille(registre, ton, index, TOTAL).transition;
          expect(rendue).toBeDefined();
          if (rendue !== undefined) expect(autorisees.has(rendue)).toBe(true);
        }
      }
    }
  });

  it('parle au modèle en caractères, pas en secondes', () => {
    // Le modèle n'écrit jamais de durée : 3 à 9 secondes à 14 caractères par
    // seconde valent 42 à 126 caractères.
    expect(bornesDeNarration('explainer')).toEqual({ min: 42, max: 126 });
    const lignes = lignesDesRegistres().join('\n');
    expect(lignes).toContain('42');
    expect(lignes).toContain('126');
  });

  it('recolle le préfixe et les ancrages dans le style', () => {
    const style = styleDe('explainer');
    expect(style).toContain('documentary');
    expect(style).toContain('never');
  });

  it('déclare ce que le registre refuse', () => {
    // Des contrôles, pas des réglages : le contraste minimum et le plafond de
    // couleurs que `controles.ts` vérifie avant le rendu.
    expect(qualiteDe('explainer')).toEqual({ contrasteMin: 4.5, couleursMax: 3 });
    expect(dureeMinDe('explainer')).toBe(3);
  });

  it('demande une musique qu on n entend pas', () => {
    // Autour de 0,08, un ducking franc, et des mots qui existent dans le
    // catalogue — `planant` et `paisible` pour weightless-horizon.
    expect(audioDe('explainer')).toEqual({
      humeur: ['paisible', 'planant', 'chaleureux'],
      litSonore: 0.08,
      ducking: 0.5,
    });
    expect(lignesDesRegistres().join('\n')).toContain('paisible');
  });

  it('dit comment la phrase doit être dite, et par qui', () => {
    // Posée, chaleureuse, nette : la diction en mots, la voix par défaut des
    // projets sans voix, et l'exagération lue par ElevenLabs.
    expect(voixDe('explainer')).toEqual({
      diction: ['posée', 'chaleureuse', 'nette'],
      voix: 'anais',
      style: 0.2,
    });
    expect(voixDe('inconnu')).toEqual(voixDe('explainer'));
  });
});
