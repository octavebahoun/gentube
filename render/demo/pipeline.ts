import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import type { Shot, Video } from '@/lib/db/schema';
import { createDeepSeekClient } from '@/lib/llm/deepseek';
import { buildStoryboardMessages, normalizeStoryboard } from '@/lib/storyboard/service';
import { llmStoryboardSchema } from '@/lib/storyboard/service';
import { cadre } from '@/lib/storyboard/cadrage';
import { audioDe, styleDe } from '@/lib/storyboard/registres';
import { visualPrompt } from '@/lib/storyboard/images';
import { animationPrompt } from '@/lib/storyboard/clips';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { clipFor, imageFor, log, voiceFor } from './medias';

/**
 * La démonstration qui passe par le **vrai** pipeline.
 *
 *   npx tsx render/demo/pipeline.ts "le thème"
 *   npx tsx render/demo/render.ts render/demo/pipeline.mp4
 *
 * Différence avec `build.ts` : ici rien n'est écrit à la main. DeepSeek écrit
 * le storyboard, `registres.ts` habille les effets, `cadrage.ts` réécrit les
 * prompts visuels. C'est la chaîne de production, moins la base et R2 — les
 * médias descendent sur disque comme pour l'autre démonstration.
 *
 * Le storyboard est mis en cache : relancer ne repaie ni DeepSeek ni le
 * cadreur. Supprimez `pipeline-storyboard.json` pour en réécrire un.
 */

/** Six scènes, dont trois animées : ce que la démonstration a le droit de coûter. */
const SCENES_MAX = 6;
const CLIPS_MAX = 3;

const THEME = process.argv[2] ?? 'Les Amazones du Dahomey';

const CACHE = 'render/demo/pipeline-storyboard.json';

/** 16:9, 480p — le format par défaut, et celui que `render.ts` monte. */
const VIDEO = {
  title: THEME,
  ratio: '16:9',
  resolution: '480p',
  voice: null,
  subtitles: true,
  subtitleStyle: 'karaoke',
  musicUrl: null,
  // Posé par le registre une fois connu (voir `main`) — pas un défaut du schéma.
  musicVolume: audioDe().litSonore,
  sfxVolume: 1,
} as unknown as Video;

type ScenePrete = {
  order: number;
  type: 'image' | 'video';
  narration: string;
  /** Le ton rendu par le modèle. Gardé pour pouvoir réhabiller sans repayer. */
  ton?: string;
  /** Le brouillon de DeepSeek, gardé pour l'afficher à côté du cadrage. */
  brouillon: string;
  prompt: string;
  render: Record<string, unknown>;
};

/**
 * Écrit le storyboard, puis le fait cadrer.
 *
 * Les deux appels sont mis en cache ensemble : le cadreur travaille sur ce que
 * DeepSeek a rendu, et rejouer l'un sans l'autre n'aurait aucun sens.
 */
async function ecrire(): Promise<{ scenes: ScenePrete[]; registre?: string }> {
  if (existsSync(CACHE)) {
    log(`storyboard repris de ${CACHE}`);
    const brut = JSON.parse(readFileSync(CACHE, 'utf8')) as
      | ScenePrete[]
      | { registre?: string; scenes: ScenePrete[] };
    // Le cache d'avant la bascule ne portait pas le registre : il retombe sur
    // le style par défaut, sans repayer une écriture.
    const scenes = Array.isArray(brut) ? brut : brut.scenes;
    const registre = Array.isArray(brut) ? undefined : brut.registre;
    return { scenes, registre };
  }

  const llm = createDeepSeekClient();

  log(`storyboard — DeepSeek écrit « ${THEME} »`);
  const completion = await llm.completeJson(
    buildStoryboardMessages({
      theme: THEME,
      // Le registre n'est pas encore connu : le style par défaut annonce la
      // couleur, et le style du registre retenu prend le relais après.
      stylePrompt: styleDe(),
      pipeline: 'mixed',
      // Six scènes de cinq à huit secondes. Le plancher de cinq secondes de
      // `docs/providers.md` tient : aucune scène ne descend sous un clip.
      targetSeconds: 40,
      library: [],
    })
  );

  const registre = llmStoryboardSchema.safeParse(completion.data).data?.registre;
  const brutes = normalizeStoryboard(completion.data, 'mixed', []).slice(0, SCENES_MAX);
  // `normalizeStoryboard` ne rend pas le ton — il est déjà traduit en effets.
  // On le relit à la source pour pouvoir réhabiller le cache plus tard sans
  // repayer une écriture.
  const tons = llmStoryboardSchema.safeParse(completion.data).data?.scenes ?? [];
  log(`  ${brutes.length} scènes · registre ${registre ?? 'explainer (défaut)'}`);

  log('cadrage — le chef op réécrit les visuels');
  // Le style appartient au registre, pas au script. Il ne sort pas d'ici :
  // seul le cadreur en a besoin comme contexte — `visualPrompt` va le
  // chercher elle-même à partir du nom du registre.
  const style = styleDe(registre);
  const cadrages = await cadre(
    brutes.map((scene) => ({
      order: scene.order,
      narration: scene.narration,
      prompt: scene.prompt,
    })),
    { client: llm, theme: THEME, stylePrompt: style, registre }
  );

  // Trois plans animés au plus, et seulement sur les scènes qui ont un visuel :
  // un plan qui dessine son propre écran n'a pas d'image à animer.
  let animes = 0;
  const scenes: ScenePrete[] = brutes.map((scene) => {
    const prompt = cadrages.get(scene.order) ?? scene.prompt;
    const anime = Boolean(prompt) && animes < CLIPS_MAX;
    if (anime) animes += 1;

    return {
      order: scene.order,
      type: anime ? 'video' : 'image',
      narration: scene.narration,
      ton: tons[scene.order - 1]?.ton,
      brouillon: scene.prompt,
      prompt,
      render: scene.render,
    };
  });

  writeFileSync(CACHE, JSON.stringify({ registre, scenes }, null, 2));
  return { scenes, registre };
}

/** Le avant/après, ligne à ligne. C'est ce qu'on est venu voir. */
function montrerLeCadrage(scenes: ScenePrete[]): void {
  log('\n─── ce que le cadreur a changé ───');
  for (const scene of scenes) {
    if (!scene.brouillon) continue;
    log(`\nscène ${scene.order}`);
    log(`  avant  ${scene.brouillon}`);
    log(`  après  ${scene.prompt}`);
  }
  log('');
}

async function main() {
  const { scenes, registre } = await ecrire();
  montrerLeCadrage(scenes);
  // Le lit sonore du registre retenu, comme la génération le pose en base.
  VIDEO.musicVolume = audioDe(registre).litSonore;

  const shots: Shot[] = [];

  for (const scene of scenes) {
    const nom = `pipe-scene-${scene.order}`;
    log(`scène ${scene.order}/${scenes.length}${scene.type === 'video' ? ' (animée)' : ''}`);

    const spoken = await voiceFor(nom, scene.narration);

    const commun = {
      id: scene.order,
      order: scene.order,
      narration: scene.narration,
      subtitle: null,
      audioUrl: `voice/${nom}.mp3`,
      durationS: spoken.durationS,
      durationSource: 'measured' as const,
      words: spoken.words,
      render: scene.render,
    };

    // Une scène sans visuel dessine son propre écran : lui payer une image
    // serait payer ce que personne ne verra.
    if (!scene.prompt) {
      shots.push({
        ...commun,
        type: 'image',
        prompt: '',
        assetUrl: null,
        sourceImageUrl: null,
      } as unknown as Shot);
      continue;
    }

    // `visualPrompt` est la fonction de production : c'est elle qui recolle le
    // style du registre, et le cadreur a justement reçu l'ordre de ne pas le
    // répéter.
    //
    // Le registre passe en troisième argument, pas en deuxième. Le deuxième
    // est le style que le **client** a écrit sur son projet ; y mettre le
    // style du registre le ferait recoller deux fois, depuis que
    // `visualPrompt` va le chercher elle-même.
    const still = await imageFor(nom, visualPrompt(scene.prompt, null, registre), {
      ratio: VIDEO.ratio,
      resolution: VIDEO.resolution,
      seed: 2_000 + scene.order,
    });

    const shot = {
      ...commun,
      type: scene.type,
      prompt: scene.prompt,
      assetUrl: still.slice(COMPOSITION_DIR.length + 1),
      sourceImageUrl: still.slice(COMPOSITION_DIR.length + 1),
    } as unknown as Shot;

    if (scene.type === 'video') {
      const clip = await clipFor(nom, still, { prompt: animationPrompt(shot) });
      shot.assetUrl = clip.slice(COMPOSITION_DIR.length + 1);
    }

    shots.push(shot);
  }

  const storyboard = toHyperframesStoryboard(VIDEO, shots);
  const target = join(COMPOSITION_DIR, 'index.html');
  writeFileSync(target, composeHtml({ storyboard, watermark: true, registre }));

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
