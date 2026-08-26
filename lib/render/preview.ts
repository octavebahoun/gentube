import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Shot, Video } from '@/lib/db/schema';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from './composition';

/**
 * Écrit une composition d'exemple dans `render/gentube-v1/index.html`.
 *
 * Sert à deux choses, et aucune n'est de la production : voir à quoi ressemble
 * une composition générée, et donner à `npx hyperframes check` quelque chose à
 * inspecter — il lui faut un `index.html` sur disque.
 *
 *   npx tsx lib/render/preview.ts
 *   npx hyperframes check render/gentube-v1
 *
 * Les médias attendus sont `media/scene-N.jpg` et `voice/scene-N.mp3` dans le
 * dossier de composition. Le script ne les crée pas : il décrit une vidéo,
 * il ne la produit pas.
 */

const NARRATIONS = [
  'Au dix-huitième siècle, le royaume du Dahomey lève une armée que personne '
    + "n'attendait.",
  'Ses soldats sont des femmes. On les appellera les Amazones.',
  'Elles gardent le palais, et elles ouvrent les batailles.',
];

function previewShots(): Shot[] {
  let start = 0;
  return NARRATIONS.map((narration, index) => {
    const durationS = 4 + index * 0.8;
    const words = narration.split(/\s+/);
    const each = durationS / words.length;
    start += durationS;

    return {
      id: index + 1,
      order: index + 1,
      type: 'image',
      prompt: '',
      narration,
      subtitle: null,
      audioUrl: `voice/scene-${index + 1}.mp3`,
      assetUrl: `media/scene-${index + 1}.jpg`,
      durationS,
      durationSource: 'measured',
      words: words.map((text, wordIndex) => ({
        text,
        start: Math.round(wordIndex * each * 1000) / 1000,
        duration: Math.round(each * 1000) / 1000,
      })),
      render: {
        effects: {
          zoom: index % 2 === 0 ? 'in' : 'out',
          transition: index === 0 ? 'none' : 'fade',
        },
      },
    } as unknown as Shot;
  });
}

const video = {
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

const storyboard = toHyperframesStoryboard(video, previewShots());
const html = composeHtml({ storyboard, watermark: true });
const target = join(COMPOSITION_DIR, 'index.html');

writeFileSync(target, html);
console.log(
  `${target} — ${storyboard.scenes.length} scènes, ` +
    `${storyboard.durationInSeconds}s, ${storyboard.width}×${storyboard.height}`
);
