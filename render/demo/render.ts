import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { COMPOSITION_DIR } from '@/lib/render/composition';
import { createRenderEngine } from '@/lib/render/lambda';

/**
 * Monte la démonstration sur Lambda et rapatrie le MP4.
 *
 *   npx tsx render/demo/render.ts
 *
 * Passe par `LambdaRenderEngine`, le même chemin que la production — seule
 * l'entrée change : un dossier de composition posé sur disque au lieu d'un
 * storyboard lu en base. Rien n'est écrit dans la base, aucun job n'est créé.
 *
 * Le rendu tourne sur Lambda et pas ici parce qu'un Chrome plus un FFmpeg sur
 * cent secondes de 848×480 ne tiennent pas dans les deux gigaoctets libres de
 * cette machine.
 */

/** Chemin de sortie, surchargeable pour garder deux rendus côte à côte. */
const OUTPUT = process.argv[2] ?? 'render/demo/amazones.mp4';

/**
 * Les dimensions sont **lues dans la composition**, pas fixées ici.
 *
 * `composeHtml` écrit `data-width` et `data-height` sur la scène ; les répéter
 * en dur donnait un rendu de travers dès qu'une démonstration changeait de
 * ratio — une vidéo verticale importée sortait bordée en 848×480. Une seule
 * source de vérité : la page qu'on rend.
 */
function dimensions(): { width: number; height: number } {
  const page = readFileSync(join(COMPOSITION_DIR, 'index.html'), 'utf8');
  const width = Number(/data-width="(\d+)"/.exec(page)?.[1]);
  const height = Number(/data-height="(\d+)"/.exec(page)?.[1]);

  if (!width || !height) {
    throw new Error(
      "index.html ne porte pas data-width/data-height : reconstruis la " +
        'composition avant de rendre.'
    );
  }
  return { width, height };
}

async function main() {
  const engine = createRenderEngine();
  const executionName = `demo-${Date.now()}`;
  const { width, height } = dimensions();

  console.log(`départ  ${COMPOSITION_DIR} → ${width}×${height}`);
  const started = await engine.start({
    projectDir: COMPOSITION_DIR,
    width,
    height,
    executionName,
  });
  console.log(`rendu   ${started.renderId}`);
  console.log(`sortie  ${started.outputS3Uri}`);

  let lastLine = '';
  for (;;) {
    const state = await engine.state(started.executionArn);

    const line =
      `  ${Math.round((state.progress ?? 0) * 100)}%` +
      (state.totalFrames
        ? ` — ${state.framesRendered ?? 0}/${state.totalFrames} images`
        : '') +
      (state.costUsd !== null ? ` — ${state.costUsd.toFixed(4)} $` : '');
    if (line !== lastLine) {
      console.log(line);
      lastLine = line;
    }

    if (state.status === 'failed') {
      console.error('échec :');
      for (const error of state.errors) console.error(`  ${error}`);
      process.exit(1);
    }

    if (state.status === 'succeeded') {
      const uri = state.output?.s3Uri ?? started.outputS3Uri;
      const mp4 = await engine.download(uri);
      writeFileSync(OUTPUT, mp4);
      console.log(
        `\n${OUTPUT} — ${(mp4.length / 1e6).toFixed(2)} Mo` +
          (state.costUsd !== null ? ` — ${state.costUsd.toFixed(4)} $ de rendu` : '')
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
