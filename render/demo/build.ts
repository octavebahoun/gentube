import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import type { Shot } from '@/lib/db/schema';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { rendersOwnContent } from '@/lib/storyboard/render';
import { CARD_SECONDS, DEMO_VIDEO, SCENES, STYLE } from './scenes';
import { clipFor, imageFor, log, voiceFor } from './medias';

/**
 * Fabrique la vidéo de démonstration, de bout en bout, en local.
 *
 *   npx tsx render/demo/build.ts
 *   npx tsx render/demo/render.ts
 *
 * Ce script n'est pas le pipeline : il ne touche ni la base, ni R2, ni les
 * jobs, et **aucun LLM ne l'écrit** — les scènes sont posées à la main dans
 * `scenes.ts` pour qu'une régression visuelle se voie. La démonstration qui
 * passe par le vrai pipeline est `pipeline.ts`.
 *
 * Voix, images et clips viennent de `medias.ts`, qui met tout en cache sur
 * disque : relancer ne repaie rien. Pour refaire une scène, supprimez son
 * fichier.
 */

async function main() {
  const shots: Shot[] = [];

  for (const [index, scene] of SCENES.entries()) {
    const isCard = Boolean(scene.render.card);
    log(`scène ${index + 1}/${SCENES.length}${isCard ? ' (carte)' : ''}`);

    // Une carte n'a ni voix, ni média : c'est une respiration noire.
    if (isCard) {
      shots.push({
        id: index + 1,
        order: index + 1,
        type: 'image',
        prompt: '',
        narration: null,
        subtitle: null,
        audioUrl: null,
        assetUrl: null,
        sourceImageUrl: null,
        durationS: CARD_SECONDS,
        durationSource: 'measured',
        words: [],
        render: scene.render,
      } as unknown as Shot);
      continue;
    }

    const spoken = await voiceFor(`scene-${index + 1}`, scene.narration);

    // Un compteur dessine son propre écran : lui générer une illustration
    // serait payer une image que personne ne verra, exactement ce que
    // `generateImages` refuse de faire en production.
    if (rendersOwnContent(scene.render)) {
      shots.push({
        id: index + 1,
        order: index + 1,
        type: 'image',
        prompt: '',
        narration: scene.narration,
        subtitle: null,
        audioUrl: `voice/scene-${index + 1}.mp3`,
        assetUrl: null,
        sourceImageUrl: null,
        durationS: spoken.durationS,
        durationSource: 'measured',
        words: spoken.words,
        render: scene.render,
      } as unknown as Shot);
      continue;
    }

    const still = await imageFor(`scene-${index + 1}`, scene.prompt, {
      style: STYLE,
      ratio: DEMO_VIDEO.ratio,
      seed: 1_000 + index,
    });
    const asset =
      scene.type === 'video' ? await clipFor(`scene-${index + 1}`, still) : still;

    shots.push({
      id: index + 1,
      order: index + 1,
      type: scene.type,
      prompt: scene.prompt,
      narration: scene.narration,
      subtitle: null,
      audioUrl: `voice/scene-${index + 1}.mp3`,
      assetUrl: asset.slice(COMPOSITION_DIR.length + 1),
      sourceImageUrl: still.slice(COMPOSITION_DIR.length + 1),
      durationS: spoken.durationS,
      durationSource: 'measured',
      words: spoken.words,
      render: scene.render,
    } as unknown as Shot);
  }

  const storyboard = toHyperframesStoryboard(DEMO_VIDEO, shots);
  const html = composeHtml({ storyboard, watermark: true });
  const target = join(COMPOSITION_DIR, 'index.html');
  writeFileSync(target, html);

  const clips = shots.filter((shot) => shot.type === 'video').length;
  log(
    `\n${target}\n${storyboard.scenes.length} scènes · ` +
      `${storyboard.durationInSeconds.toFixed(1)}s · ` +
      `${storyboard.width}×${storyboard.height} · ${clips} plans animés`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
