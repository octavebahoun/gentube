import type { Shot, Video } from '@/lib/db/schema';
import type { SceneRender } from '@/lib/storyboard/render';

/**
 * Le storyboard de démonstration — une scène par transition.
 *
 * Il n'a rien à voir avec la production : aucun LLM ne l'écrit, aucune base ne
 * le stocke. Il existe pour qu'on puisse **voir** ce que la composition sait
 * faire, et pour qu'une régression visuelle se remarque avant un client.
 *
 * Les 17 transitions du contrat y passent, chacune une fois : les trois CSS
 * (`none`, `fade`, `black`) et les quatorze shaders. S'y ajoutent le zoom, le
 * tremblement, l'éclair, le bandeau, les quatre variantes de titre cinétique,
 * la carte texte, et trois plans animés au milieu des fixes.
 */

export type DemoScene = {
  narration: string;
  /** Ce qui part au générateur d'images. Le style commun est recollé ailleurs. */
  prompt: string;
  type: 'image' | 'video';
  render: SceneRender;
};

/** Le style, recollé sur chaque prompt — comme le fait `visualPrompt()`. */
export const STYLE =
  'cinematic documentary still, warm West African light, 35mm film grain, ' +
  'shallow depth of field, muted ochre and indigo palette';

export const SCENES: DemoScene[] = [
  {
    narration:
      'Au dix-huitième siècle, le royaume du Dahomey lève une armée que personne n’attendait.',
    prompt: 'wide establishing shot of a fortified royal palace at dawn, red earth walls',
    type: 'image',
    render: {
      effects: { transition: 'none', zoom: 'in' },
      kineticTitle: {
        text: 'LES AMAZONES',
        startInSeconds: 0.4,
        variant: 'reveal',
        position: 'center',
        animationDuration: 0.55,
        staggerDelay: 0.12,
      },
    },
  },
  {
    narration: 'Ses soldats sont des femmes. On les appellera les Amazones du Dahomey.',
    prompt: 'portrait of a woman warrior in ceremonial dress, direct gaze, low sun',
    type: 'image',
    render: { effects: { transition: 'domain-warp', zoom: 'in' } },
  },
  {
    narration:
      'Elles gardent le palais la nuit, et le jour elles ouvrent les batailles.',
    prompt: 'torchlit palace courtyard at night, silhouettes standing guard',
    type: 'image',
    render: { effects: { transition: 'push-left', zoom: 'out' } },
  },
  {
    narration:
      'Le recrutement commence tôt. Une fille de douze ans peut y entrer, et n’en ressortira pas.',
    prompt: 'young girls training in a dusty compound, rows of wooden staffs',
    type: 'image',
    render: { effects: { transition: 'ridged-burn', zoom: 'in' } },
  },
  {
    narration:
      'L’entraînement est brutal : haies d’épines, marches forcées, jeûne imposé.',
    prompt: 'thorn barrier obstacle course, dust and heat haze, harsh midday light',
    type: 'image',
    render: { effects: { transition: 'push-up', zoom: 'in', shake: true } },
  },
  {
    narration: 'Celles qui tiennent deviennent la garde rapprochée du roi.',
    prompt: 'ceremonial procession moving through a village, banners and drums',
    type: 'video',
    render: { effects: { transition: 'whip-pan', cameraMotion: 'pan' } },
  },
  {
    narration:
      'Elles portent le fusil, le coupe-coupe, et un rasoir long comme un avant-bras.',
    prompt: 'still life of period weapons laid on woven cloth, museum lighting',
    type: 'image',
    render: {
      effects: { transition: 'zoom-through', zoom: 'out' },
      overlayText: { text: 'Fusil · coupe-coupe · rasoir', startInSeconds: 0.5 },
    },
  },
  {
    narration: 'Au plus fort, elles sont six mille — un tiers de l’armée du royaume.',
    prompt: '',
    type: 'image',
    render: {
      effects: { transition: 'sdf-iris' },
      counter: { value: 6000, label: 'soldates au plus fort', durationInSeconds: 2 },
    },
  },
  {
    narration: 'Les voyageurs européens qui les croisent n’en reviennent pas.',
    prompt: 'nineteenth century engraving style scene of foreign envoys taking notes',
    type: 'image',
    render: {
      effects: { transition: 'squeeze', zoom: 'out' },
      kineticTitle: {
        text: 'SIX MILLE',
        startInSeconds: 0.6,
        variant: 'neon',
        position: 'center',
        highlightColor: '#ce1f20',
        glowColor: '#ff6b2b',
      },
    },
  },
  {
    narration: 'Leur chant de guerre annonce qu’elles reviendront victorieuses ou pas du tout.',
    prompt: 'warriors singing in formation at golden hour, mouths open, motion',
    type: 'video',
    render: { effects: { transition: 'glitch', cameraMotion: 'dolly' } },
  },
  {
    narration: 'En 1890, la France attaque le Dahomey. Les fusils ont changé de siècle.',
    prompt: 'colonial rifles firing, smoke across a tree line, chaotic light',
    type: 'image',
    render: {
      effects: {
        transition: 'push-right',
        zoom: 'in',
        flash: { startInSeconds: 0.8, durationInSeconds: 0.22, color: '#ffd9a0' },
      },
    },
  },
  {
    narration: 'Elles chargent quand même, à découvert, contre des tirs en rafale.',
    prompt: 'charge across open ground, tall grass, dust and blur',
    type: 'image',
    render: {
      effects: { transition: 'swirl-vortex', zoom: 'in', matchCut: true },
      kineticTitle: {
        text: 'ELLES CHARGENT',
        startInSeconds: 0.5,
        variant: 'pin',
        position: 'bottom',
        highlightColor: '#ce1f20',
      },
    },
  },
  {
    narration: 'La guerre dure deux ans. Le royaume tombe, et le régiment avec lui.',
    prompt: 'abandoned palace gate, empty courtyard, long shadows',
    type: 'image',
    render: {
      effects: { transition: 'swirl-vortex' },
      counter: { value: 2, label: 'ans de guerre', variant: 'ring', durationInSeconds: 1.6 },
    },
  },
  {
    narration: 'Les dernières survivantes vieillissent dans des villages qui les oublient.',
    prompt: 'elderly woman seated in a doorway, weathered hands, soft light',
    type: 'image',
    render: { effects: { transition: 'thermal-distortion', zoom: 'in' } },
  },
  {
    narration: 'La plus âgée d’entre elles s’éteint en 1979. Elle avait vu les deux mondes.',
    prompt: 'slow portrait of an old woman looking off camera, quiet room',
    type: 'video',
    render: { effects: { transition: 'push-left', cameraMotion: 'static' } },
  },
  {
    narration: 'Aujourd’hui, une statue de trente mètres les regarde depuis Cotonou.',
    prompt: 'monumental bronze statue of a woman warrior against a wide sky',
    type: 'image',
    render: {
      effects: { transition: 'light-leak', zoom: 'out' },
      kineticTitle: {
        text: 'COTONOU 2022',
        startInSeconds: 0.6,
        variant: 'icon',
        position: 'bottom',
        icon: '★',
        iconLabel: 'Bénin',
      },
    },
  },
  {
    narration: 'Elles n’étaient pas une légende. Elles étaient une armée.',
    prompt: 'close up of the statue face at sunset, warm rim light',
    type: 'image',
    render: { effects: { transition: 'black', zoom: 'none' } },
  },
  {
    narration: '',
    prompt: '',
    type: 'image',
    render: {
      effects: { transition: 'fade' },
      card: { text: 'Les Amazones du Dahomey', subtext: 'Démonstration GenTube' },
    },
  },
];

/** La vidéo qui porte ces scènes. 16:9, 480p — le format par défaut. */
export const DEMO_VIDEO = {
  title: 'Les Amazones du Dahomey',
  ratio: '16:9',
  resolution: '480p',
  voice: null,
  subtitles: true,
  subtitleStyle: 'karaoke',
  musicUrl: null,
  musicVolume: 0.09,
  sfxVolume: 1,
} as unknown as Video;

/** Durée d'une carte : elle n'a pas de voix pour la mesurer. */
export const CARD_SECONDS = 3;

export type DemoShot = Shot;
