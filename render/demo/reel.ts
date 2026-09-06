/*
 * Le chemin principal, une fois, pour de vrai.
 *
 *   pnpm tsx <ce fichier>
 *
 * DeepSeek écrit le storyboard, Cloudflare Flux dessine une image par scène,
 * Edge pose la voix et mesure les mots, puis le moteur assemble. Rien ne passe
 * par la base : aucune ligne n'est écrite sur le Supabase distant, c'est un
 * essai d'image et pas une vidéo de client.
 *
 * La voix est celle de mesure (Edge, gratuite) : la qualité de voix ne se voit
 * pas sur une planche-contact, et ElevenLabs se facture au caractère.
 */
import { mkdirSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Shot, Video } from '@/lib/db/schema';
import { buildStoryboardMessages, normalizeStoryboard } from '@/lib/storyboard/service';
import { createDeepSeekClient } from '@/lib/llm/deepseek';
import { createImageClient, imageCostUsd } from '@/lib/images/flux';
import { createMeasuringVoiceClient } from '@/lib/voice';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';

const DIR = resolve(process.argv[2] ?? 'render/demo/reel');
const THEME =
  process.env.THEME ??
  "GenTube, la plateforme qui transforme un texte en video pour les createurs d'Afrique de l'Ouest";
const RATIO = '16:9' as const;
const QUALITY = 'standard' as const;

rmSync(DIR, { recursive: true, force: true });
mkdirSync(join(DIR, 'media'), { recursive: true });
mkdirSync(join(DIR, 'voice'), { recursive: true });
for (const part of ['style.css', 'hyperframes.json', 'vendor']) {
  cpSync(join(COMPOSITION_DIR, part), join(DIR, part), { recursive: true });
}

async function main() {
  console.log('· storyboard — DeepSeek');
  const messages = buildStoryboardMessages({
    theme: THEME,
    pipeline: 'image',
    targetSeconds: 45,
    library: [],
  });
  const data = await createDeepSeekClient().completeJson(messages);
  const scenes = normalizeStoryboard(data, 'image', []);
  console.log(`  ${scenes.length} scènes`);

  const voix = createMeasuringVoiceClient();
  const images = createImageClient();
  let dollars = 0;

  const shots: Shot[] = [];
  for (const scene of scenes) {
    const n = scene.order;
    process.stdout.write(`· plan ${n} · voix`);
    const dite = await voix.synthesize(scene.narration);
    writeFileSync(join(DIR, 'voice', `s${n}.mp3`), dite.audio);

    let media: string | null = null;
    if (scene.prompt) {
      process.stdout.write(' · image');
      const image = await images.generate({
        prompt: scene.prompt,
        ratio: RATIO,
      });
      const nom = `s${n}.${image.contentType.includes('png') ? 'png' : 'jpg'}`;
      writeFileSync(join(DIR, 'media', nom), image.bytes);
      media = `media/${nom}`;
      dollars += imageCostUsd(image.width, image.height);
    }
    console.log(` · ${dite.durationS.toFixed(1)} s`);

    shots.push({
      id: n,
      order: n,
      type: 'image',
      prompt: scene.prompt,
      narration: scene.narration,
      subtitle: null,
      assetUrl: media,
      audioUrl: `voice/s${n}.mp3`,
      durationS: dite.durationS,
      durationSource: 'measured',
      words: dite.words,
      render: scene.render,
    } as unknown as Shot);
  }

  const video = {
    title: 'GenTube',
    ratio: RATIO,
    quality: QUALITY,
    voice: null,
    subtitles: true,
    subtitleStyle: 'karaoke',
    musicUrl: null,
    musicVolume: 0.09,
    sfxVolume: 1,
  } as unknown as Video;

  const storyboard = toHyperframesStoryboard(video, shots);
  writeFileSync(join(DIR, 'index.html'), composeHtml({ storyboard, watermark: true }));
  writeFileSync(join(DIR, 'storyboard.json'), JSON.stringify(scenes, null, 2));

  console.log(
    `\n${storyboard.scenes.length} scènes · ${storyboard.durationInSeconds.toFixed(1)} s` +
      ` · images : ${dollars.toFixed(4)} $`
  );
  console.log(DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
