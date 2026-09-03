/*
 * Un essai de rendu complet des plans du palier 3.
 *
 *   pnpm tsx render/demo/palier-3.ts
 *   npx hyperframes render render/demo/palier-3 \
 *     -o render/demo/palier-3.mp4 -q draft --no-browser-gpu -w 2
 *
 * Ce que la garde visuelle ne peut pas dire : à quoi ressemble une vidéo
 * entière. Elle capture des instants isolés ; ici les dix plans s'enchaînent
 * avec leurs transitions, leur voix et leurs sous-titres, et on voit ce que
 * personne ne verrait autrement — un plan qui écrase le suivant, un bandeau
 * qui reste, un rythme qui ne tient pas.
 *
 * Rien n'est généré et rien n'est facturé : les images et les voix viennent
 * des fixtures de régression, déjà commitées. Le rendu tourne en local, en
 * SwiftShader — cinquante secondes de 848×480 en quarante-cinq secondes de
 * machine, sans toucher à Lambda.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Shot, Video } from '@/lib/db/schema';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { REFERENCE_VIDEO } from '@/render/regression/fixtures';

const HERE = resolve('render/regression');
const DIR = resolve(process.argv[2] ?? 'render/demo/palier-3');

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
for (const part of ['style.css', 'hyperframes.json', 'vendor']) {
  cpSync(join(COMPOSITION_DIR, part), join(DIR, part), { recursive: true });
}
cpSync(join(HERE, 'media'), join(DIR, 'media'), { recursive: true });
cpSync(join(HERE, 'voice'), join(DIR, 'voice'), { recursive: true });

const MOTS = 'un deux trois quatre cinq six'.split(' ');
const words = MOTS.map((text, i) => ({ text, start: i * 0.42, duration: 0.42 }));

let ordre = 0;
const plan = (
  seconds: number,
  render: Record<string, unknown>,
  media: number | null
): Shot =>
  ({
    id: `s${ordre}`,
    videoId: 'essai',
    order: ordre++,
    type: 'image',
    prompt: media ? 'fond' : '',
    narration: MOTS.join(' '),
    subtitle: null,
    assetUrl: media ? `media/scene-${media}.jpg` : null,
    audioUrl: `voice/scene-${(ordre % 6) + 1}.mp3`,
    durationS: seconds,
    durationSource: 'measured',
    status: 'ready',
    words,
    render,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Shot;

const shots: Shot[] = [
  plan(4, {
    effects: { transition: 'none', zoom: 'in' },
    kineticTitle: { text: 'LES PLANS DU PALIER TROIS', variant: 'slam', position: 'center' },
    emphasis: ['trois'],
  }, 1),
  plan(4, {
    effects: { transition: 'wipe-left' },
    lowerThird: { name: 'Kofi Mensah', role: 'agronome, Cotonou', variant: 'bar' },
    overlayText: { text: 'Un bandeau, en bas cette fois', position: 'bottom', accent: true },
  }, 2),
  plan(5, {
    effects: { transition: 'black' },
    counter: { value: 6000, label: 'sacs collectes', variant: 'wheel', durationInSeconds: 2.4 },
  }, null),
  plan(5, {
    effects: { transition: 'fade' },
    chart: {
      kind: 'bar',
      title: 'Trois villes, trois volumes',
      suffix: ' %',
      startInSeconds: 0.4,
      points: [
        { label: 'Cotonou', value: 40 },
        { label: 'Porto-Novo', value: 25 },
        { label: 'Parakou', value: 10 },
      ],
    },
  }, null),
  plan(5, {
    effects: { transition: 'iris-in' },
    chart: {
      kind: 'line',
      title: 'Le volume, mois par mois',
      startInSeconds: 0.4,
      points: [
        { label: 'Juin', value: 12 },
        { label: 'Juillet', value: 21 },
        { label: 'Aout', value: 38 },
      ],
    },
  }, null),
  plan(6, {
    effects: { transition: 'curtain' },
    thread: {
      title: 'Groupe cooperative',
      startInSeconds: 0.4,
      messages: [
        { from: 'Awa', text: 'Tu as vu les chiffres du mois ?' },
        { from: 'Moi', text: 'Trois fois plus qu en juin.', mine: true },
        { from: 'Awa', text: 'On garde le meme rythme.', typing: true },
      ],
    },
  }, null),
  plan(5, {
    effects: { transition: 'barn-doors' },
    list: {
      title: 'Quatre chiffres du mois',
      ordered: true,
      startInSeconds: 0.4,
      items: [
        { text: 'Adhesions nouvelles', value: '412' },
        { text: 'Sacs collectes', value: '6 000' },
        { text: 'Villages couverts', value: '17' },
        { text: 'Delai moyen', value: '2 j' },
      ],
    },
  }, null),
  plan(5, {
    effects: { transition: 'push-left' },
    comparison: {
      title: 'Avant et apres la cooperative',
      startInSeconds: 0.4,
      left: { label: 'Avant', items: ['Vente au bord de route', 'Prix subi', 'Aucun stock'] },
      right: { label: 'Apres', items: ['Vente groupee', 'Prix negocie', 'Magasin commun'] },
    },
  }, null),
  plan(5, {
    effects: { transition: 'fade' },
    quote: {
      text: 'La terre ne ment jamais sur ce qu on lui a donne',
      author: 'Kofi Mensah',
      role: 'agronome, Cotonou',
      startInSeconds: 0.4,
    },
  }, null),
  plan(3, {
    effects: { transition: 'black' },
    card: { text: 'GenTube', subtext: 'Moteur de montage' },
  }, null),
];

const video = { ...REFERENCE_VIDEO, title: 'Essai palier 3' } as Video;
const storyboard = toHyperframesStoryboard(video, shots);
writeFileSync(join(DIR, 'index.html'), composeHtml({ storyboard, watermark: true }));

console.log(`${storyboard.scenes.length} scènes · ${storyboard.durationInSeconds.toFixed(1)} s`);
console.log(DIR);
