/*
 * La vidéo de présentation de GenTube, faite avec GenTube.
 *
 *   pnpm tsx render/demo/gentube.ts
 *   npx hyperframes render render/demo/gentube \
 *     -o render/demo/gentube.mp4 -q draft --no-browser-gpu -w 2
 *
 * Ce n'est pas une démonstration commerciale, c'est un essai : elle enchaîne
 * un exemplaire de chaque **type de plan** que le moteur sait rendre, pour
 * qu'on voie d'un seul tenant ce que le catalogue permet de tourner. La garde
 * visuelle capture des instants isolés et ne dira jamais si une liste écrase
 * la carte suivante, si un bandeau reste, si le rythme tient.
 *
 * Rien n'est généré et rien n'est facturé. Les images et les voix viennent des
 * fixtures de régression, déjà commitées, et le rendu tourne en local en
 * SwiftShader. La voix ne dit pas le texte des sous-titres : c'est un essai
 * d'image, pas de montage sonore.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Shot, Video } from '@/lib/db/schema';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { REFERENCE_VIDEO } from '@/render/regression/fixtures';

const HERE = resolve('render/regression');
const DIR = resolve(process.argv[2] ?? 'render/demo/gentube');

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
for (const part of ['style.css', 'hyperframes.json', 'vendor']) {
  cpSync(join(COMPOSITION_DIR, part), join(DIR, part), { recursive: true });
}
cpSync(join(HERE, 'media'), join(DIR, 'media'), { recursive: true });
cpSync(join(HERE, 'voice'), join(DIR, 'voice'), { recursive: true });

let ordre = 0;

/**
 * Un plan.
 *
 * Les mots sont recalculés sur la durée réelle du plan, jamais sur un pas
 * fixe : un sous-titre calé sur six mots d'une autre scène se désynchronise
 * dès que la durée change, et c'est invisible sur une capture d'instant.
 */
const plan = (
  seconds: number,
  narration: string,
  render: Record<string, unknown>,
  media: number | null
): Shot => {
  const mots = narration.split(' ');
  const pas = (seconds - 0.4) / Math.max(1, mots.length);
  return {
    id: `s${ordre}`,
    videoId: 'gentube',
    order: ordre++,
    type: 'image',
    prompt: media ? 'fond' : '',
    narration,
    subtitle: null,
    assetUrl: media ? `media/scene-${media}.jpg` : null,
    audioUrl: `voice/scene-${(ordre % 6) + 1}.mp3`,
    durationS: seconds,
    durationSource: 'measured',
    status: 'ready',
    words: mots.map((text, i) => ({
      text,
      start: Math.round((0.2 + i * pas) * 1000) / 1000,
      duration: Math.round(pas * 1000) / 1000,
    })),
    render,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Shot;
};

const shots: Shot[] = [
  // 1 · l'ouverture : un titre qui claque, sur une image.
  plan(4, 'GenTube transforme un texte en video', {
    effects: { transition: 'none', zoom: 'in' },
    kineticTitle: { text: 'GENTUBE', variant: 'slam', position: 'center' },
    emphasis: ['video'],
  }, 1),

  // 2 · le probleme, en toutes lettres, sur une nappe.
  plan(5, 'Une video coute une semaine et un budget', {
    effects: { transition: 'wipe-left', vignette: { strength: 0.6 } },
    kineticTitle: { text: 'UNE SEMAINE. UN BUDGET.', variant: 'marker', position: 'center' },
  }, 2),

  // 3 · le chiffre qui porte l'argument.
  plan(5, 'Ici une minute revient a quatre cents francs', {
    effects: { transition: 'black' },
    counter: { value: 400, label: 'FCFA la minute', variant: 'wheel', durationInSeconds: 2.4 },
  }, null),

  // 4 · ce que la plateforme fait, en liste.
  plan(6, 'Le texte devient un plan une voix une image', {
    effects: { transition: 'fade' },
    list: {
      title: 'Ce que la plateforme fait',
      layout: 'checklist',
      items: [
        { text: 'Ecrit le storyboard' },
        { text: 'Genere les images' },
        { text: 'Pose la voix et les sous-titres' },
        { text: 'Monte et rend le fichier' },
      ],
      startInSeconds: 0.3,
      stepSeconds: 0.6,
    },
  }, null),

  // 5 · le marche, en barres.
  plan(5, 'Trois pays trois marches a prendre', {
    effects: { transition: 'iris-in' },
    chart: {
      kind: 'bar',
      title: 'Createurs actifs, en milliers',
      startInSeconds: 0.4,
      points: [
        { label: 'Benin', value: 18 },
        { label: 'Togo', value: 12 },
        { label: 'Cote d Ivoire', value: 41 },
      ],
    },
  }, null),

  // 6 · la courbe, l'autre forme du meme plan.
  plan(5, 'Et la courbe monte depuis juin', {
    effects: { transition: 'push-up' },
    chart: {
      kind: 'line',
      title: 'Videos rendues, par mois',
      startInSeconds: 0.4,
      points: [
        { label: 'Juin', value: 120 },
        { label: 'Juillet', value: 310 },
        { label: 'Aout', value: 540 },
        { label: 'Septembre', value: 910 },
      ],
    },
  }, null),

  // 7 · le pipeline, en frise.
  plan(6, 'Quatre etapes du texte au fichier rendu', {
    effects: { transition: 'curtain' },
    list: {
      title: 'Du texte au fichier',
      layout: 'timeline',
      items: [
        { text: 'Texte', value: '0 s' },
        { text: 'Storyboard', value: '8 s' },
        { text: 'Images', value: '90 s' },
        { text: 'Rendu', value: '45 s' },
      ],
      startInSeconds: 0.3,
      stepSeconds: 0.5,
    },
  }, null),

  // 8 · une voix humaine : bandeau, puis citation.
  plan(4, 'Les createurs la prennent en main seuls', {
    effects: { transition: 'fade', spotlightCard: { startInSeconds: 0.2 } },
    lowerThird: { name: 'Ama Doe', role: 'creatrice, Lome', variant: 'clean-bar' },
  }, 3),

  plan(5, 'Elle dit avoir gagne ses journees', {
    effects: { transition: 'fade' },
    quote: {
      text: 'Je monte une video pendant que le the refroidit',
      author: 'Ama Doe',
      role: 'creatrice, Lome',
      startInSeconds: 0.4,
    },
  }, null),

  // 9 · la comparaison, avant et apres.
  plan(5, 'Avant six jours apres six minutes', {
    effects: { transition: 'barn-doors' },
    comparison: {
      title: 'Le meme film',
      left: { label: 'A la main', items: ['6 jours', '3 personnes', '250 000 FCFA'] },
      right: { label: 'Avec GenTube', items: ['6 minutes', '1 personne', '2 400 FCFA'] },
      startInSeconds: 0.3,
    },
  }, null),

  // 10 · la preuve sociale, en carte de reseau.
  plan(5, 'Et le public le dit lui meme', {
    effects: { transition: 'slide-diagonal' },
    socialCard: {
      network: 'x',
      title: 'Ama Doe',
      subtitle: '@amadoe',
      body: 'Trois videos publiees ce matin. Avant j en faisais une par mois.',
      action: 'Suivre',
      side: 'right',
      startInSeconds: 0.3,
      holdSeconds: 3.6,
    },
  }, 4),

  // 11 · un fil de discussion, le plan le plus bavard.
  plan(6, 'Le support repond dans la journee', {
    effects: { transition: 'fold' },
    thread: {
      title: 'Support GenTube',
      messages: [
        { from: 'Ama', text: 'Ma video est en 9:16 ?' },
        { from: 'GenTube', text: 'Oui, le format est un reglage.', mine: true },
        { from: 'Ama', text: 'Parfait, je publie.' },
      ],
      startInSeconds: 0.3,
    },
  }, null),

  // 12 · la cloture : la phrase, puis le bouton.
  plan(5, 'Essayez GenTube des aujourd hui', {
    effects: { transition: 'zoom-through' },
    callToAction: {
      headline: 'Votre premiere video en six minutes',
      buttonText: 'Commencer',
      subtext: 'Sans carte bancaire',
      rating: 4.5,
      variant: 'lockup',
      startInSeconds: 0.4,
    },
  }, null),
];

const video = {
  ...REFERENCE_VIDEO,
  title: 'GenTube — la plateforme',
  subtitleStyle: 'karaoke',
} as Video;
const storyboard = toHyperframesStoryboard(video, shots);
writeFileSync(join(DIR, 'index.html'), composeHtml({ storyboard, watermark: true }));

console.log(`${storyboard.scenes.length} scènes · ${storyboard.durationInSeconds.toFixed(1)} s`);
console.log(DIR);
