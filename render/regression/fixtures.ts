import type { Shot, Video } from '@/lib/db/schema';
import type { SceneRender } from '@/lib/storyboard/render';

/**
 * Le storyboard de référence.
 *
 * Rien ici n'est généré : quatre fonds unis et un silence, commités dans le
 * dépôt. C'est la condition pour qu'une régression visuelle soit détectable —
 * si l'image d'entrée change, l'image de sortie change, et le test ne dit plus
 * rien sur le moteur.
 *
 * Les durées sont écrites à la main, contrairement à la production où elles
 * viennent de la voix off mesurée. Une durée mesurée dépendrait du service de
 * synthèse, donc du réseau, donc du jour.
 *
 * Chaque scène couvre une chose et une seule, pour qu'un échec nomme le
 * coupable au lieu de dire « la vidéo a changé ».
 */

type Fixture = { seconds: number; media: number | null; render: SceneRender };

const FIXTURES: Fixture[] = [
  // 1. L'ouverture : aucune transition, un zoom avant, un titre cinétique.
  {
    seconds: 3,
    media: 1,
    render: {
      effects: { transition: 'none', zoom: 'in' },
      kineticTitle: { text: 'TITRE CINETIQUE', variant: 'reveal', position: 'center' },
    },
  },
  // 2. Un fondu enchaîné, le geste le plus banal et le plus utilisé.
  { seconds: 3, media: 2, render: { effects: { transition: 'fade', zoom: 'out' } } },
  // 3. Une poussée : deux scènes à l'écran, celle qui sort et celle qui entre.
  { seconds: 3, media: 3, render: { effects: { transition: 'push-left' } } },
  // 4. Un shader : le compositeur prend la main sur la visibilité.
  {
    seconds: 3,
    media: 4,
    render: {
      effects: { transition: 'glitch' },
      overlayText: { text: 'Bandeau pose sur le plan' },
    },
  },
  // 5. Un compteur : aucune image, le plan se dessine seul.
  {
    seconds: 3,
    media: null,
    render: {
      effects: { transition: 'black' },
      counter: { value: 6000, label: 'unites comptees', durationInSeconds: 2 },
    },
  },
  // 6. Une carte de fin : ni voix, ni média, ni son.
  {
    seconds: 2,
    media: null,
    render: {
      effects: { transition: 'fade' },
      card: { text: 'Carte de fin', subtext: 'Reference visuelle' },
    },
  },
];

/** Une narration de longueur fixe : les mots portent le karaoké. */
const WORDS = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six'];

export function referenceShots(): Shot[] {
  return FIXTURES.map((fixture, index) => {
    const each = fixture.seconds / WORDS.length;
    const carte = Boolean(fixture.render.card);

    return {
      id: index + 1,
      order: index + 1,
      type: 'image',
      prompt: '',
      narration: carte ? null : WORDS.join(' '),
      subtitle: null,
      audioUrl: carte ? null : `voice/scene-${index + 1}.mp3`,
      assetUrl: fixture.media ? `media/scene-${fixture.media}.jpg` : null,
      sourceImageUrl: null,
      durationS: fixture.seconds,
      durationSource: 'measured',
      words: carte
        ? []
        : WORDS.map((text, i) => ({
            text,
            start: Math.round(i * each * 1000) / 1000,
            duration: Math.round(each * 1000) / 1000,
          })),
      render: fixture.render,
    } as unknown as Shot;
  });
}

export const REFERENCE_VIDEO = {
  title: 'Reference visuelle GenTube',
  ratio: '16:9',
  resolution: '480p',
  voice: null,
  subtitles: true,
  subtitleStyle: 'karaoke',
  musicUrl: null,
  musicVolume: 0.09,
  sfxVolume: 1,
} as unknown as Video;

/**
 * Les instants capturés, et ce que chacun surveille.
 *
 * Pris au milieu des gestes plutôt qu'à leur début : une transition ne dit rien
 * à son premier pour cent. Les noms servent de messages d'échec.
 */
export const MOMENTS: { at: number; nom: string }[] = [
  { at: 1.2, nom: 'titre-cinetique' },
  { at: 2.9, nom: 'fondu-enchaine' },
  { at: 5.9, nom: 'poussee-gauche' },
  { at: 8.9, nom: 'shader-glitch' },
  { at: 10.5, nom: 'bandeau' },
  { at: 12.4, nom: 'compteur' },
  { at: 15.2, nom: 'carte-de-fin' },
];
