import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEdgeClient } from '@/lib/voice/edge';
import { createImageClient } from '@/lib/images/flux';
import { COMPOSITION_DIR } from '@/lib/render/composition';

/**
 * Les trois fournisseurs des démonstrations : voix, image fixe, clip animé.
 *
 * Sortis de `build.ts` le 5 septembre 2026, quand `pipeline.ts` a eu besoin
 * des mêmes trois fonctions. Les recopier aurait dupliqué le cache disque et
 * la reprise de tâche Novita — c'est-à-dire les deux endroits où une erreur se
 * paie deux fois.
 *
 * Chaque média est **nommé**, pas numéroté : deux démonstrations vivent dans
 * le même dossier sans se marcher dessus, et celle qui est déjà payée le reste.
 */

export const MEDIA_DIR = join(COMPOSITION_DIR, 'media');
export const VOICE_DIR = join(COMPOSITION_DIR, 'voice');

mkdirSync(MEDIA_DIR, { recursive: true });
mkdirSync(VOICE_DIR, { recursive: true });

/*
 * La route Novita, changée deux fois le 5 septembre 2026.
 *
 * `seedance-v1-pro-i2v` rend 404 : Novita l'a retirée. `wan-2.5-i2v-preview`
 * l'a remplacée, puis a été abandonnée à son tour — 0,25 $ le clip de 5 s en
 * 480P, contre 0,19 $ chez Minimax Hailuo 2.3.
 *
 * Hailuo attend un corps **à plat** : ni `input`, ni `parameters`, et donc pas
 * la double orthographe de wan2.5.
 */
const NOVITA_MODEL = 'minimax-hailuo-2.3-i2v';

/**
 * Les réglages du clip.
 *
 * `duration` ne connaît que 6 ou 10 — pas 5, comme wan2.5. `resolution`
 * plancher à 768P ; la composition rend en 848×480, donc l'image est
 * réduite, jamais étirée.
 *
 * `enable_prompt_expansion` est **coupé**, et c'est le réglage qui compte :
 * activé, Minimax passe le prompt dans son propre LLM avant de générer. Le
 * cadreur a justement fixé le casting mot pour mot ; laisser un second modèle
 * le paraphraser rendrait un personnage différent à chaque plan, c'est-à-dire
 * exactement ce qu'on venait de réparer.
 */
const CLIP_REGLAGES = {
  duration: 6,
  resolution: '768P',
  enable_prompt_expansion: false,
  aigc_watermark: false,
} as const;

export const log = (message: string) => console.log(message);

/**
 * Réessaie ce qui tombe pour une raison de réseau et pas de contenu.
 *
 * Le lien d'ici sort en IPv6 sur des adresses injoignables et Node perd la
 * première tentative dessus. Sans reprise, une vidéo de dix-huit scènes casse
 * sur la quatrième et ce qui précède est déjà payé.
 */
export async function withRetry<T>(label: string, task: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await task();
    } catch (error) {
      last = error;
      const reason = error instanceof Error ? error.message : String(error);
      log(`  ↻ ${label} — essai ${attempt}/4 : ${reason}`);
      await new Promise((r) => setTimeout(r, attempt * 3_000));
    }
  }
  throw last;
}

export type Mesure = {
  durationS: number;
  words: { text: string; start: number; duration: number }[];
};

/** La voix off : Edge TTS, gratuit. C'est elle qui mesure chaque scène. */
export async function voiceFor(nom: string, narration: string): Promise<Mesure> {
  const file = join(VOICE_DIR, `${nom}.mp3`);
  const meta = join(VOICE_DIR, `${nom}.json`);

  if (existsSync(file) && existsSync(meta)) {
    return JSON.parse(readFileSync(meta, 'utf8')) as Mesure;
  }

  const spoken = await withRetry(`voix ${nom}`, () =>
    createEdgeClient().synthesize(narration)
  );
  writeFileSync(file, spoken.audio);
  const measured = { durationS: spoken.durationS, words: spoken.words };
  writeFileSync(meta, JSON.stringify(measured));
  log(`  voix   ${nom} — ${spoken.durationS.toFixed(2)}s`);
  return measured;
}

/** L'image fixe : Cloudflare Workers AI. Matière première d'un plan animé. */
export async function imageFor(
  nom: string,
  prompt: string,
  {
    style,
    ratio,
    resolution,
    seed,
  }: { style?: string; ratio: string; resolution: string; seed: number }
): Promise<string> {
  const file = join(MEDIA_DIR, `${nom}.jpg`);
  if (existsSync(file)) return file;

  const image = await withRetry(`image ${nom}`, () =>
    createImageClient().generate({
      prompt: style ? `${prompt}, ${style}` : prompt,
      ratio,
      resolution,
      seed,
    } as Parameters<ReturnType<typeof createImageClient>['generate']>[0])
  );
  writeFileSync(file, image.bytes);
  log(`  image  ${nom} — ${image.width}×${image.height}`);
  return file;
}

/**
 * Le clip animé : Novita, en interrogation. Démo uniquement.
 *
 * Le fournisseur de clips du produit est Replicate (`lib/video/`) ; Novita ne
 * sert qu'ici, parce qu'il rend un clip sans URL publique à exposer.
 */
export async function clipFor(
  nom: string,
  sourceImage: string,
  {
    prompt = 'subtle cinematic motion, slow push-in, natural light',
    seconds = 6,
  }: { prompt?: string; seconds?: 6 | 10 } = {}
): Promise<string> {
  const file = join(MEDIA_DIR, `${nom}.mp4`);
  if (existsSync(file)) return file;

  const key = process.env.NOVITA_API_KEY?.trim();
  if (!key) throw new Error('NOVITA_API_KEY manquante — impossible d’animer.');

  // Une génération est payée : le task_id est écrit avant toute autre chose.
  // Sans ça, une coupure réseau pendant l'interrogation fait repayer le clip
  // à la relance — c'est arrivé une fois, ça ne se reproduit pas.
  const ticket = join(MEDIA_DIR, `${nom}.task`);
  let taskId: string | undefined;

  if (existsSync(ticket)) {
    taskId = readFileSync(ticket, 'utf8').trim();
    log(`  clip   ${nom} — tâche ${taskId} reprise, rien à repayer`);
  } else {
    const image = `data:image/jpeg;base64,${readFileSync(sourceImage).toString('base64')}`;

    const submitted = await withRetry(`clip ${nom}`, () =>
      fetch(`https://api.novita.ai/v3/async/${NOVITA_MODEL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          prompt,
          image,
          ...CLIP_REGLAGES,
          duration: seconds,
        }),
      })
    );

    if (!submitted.ok) {
      throw new Error(`Novita ${submitted.status} : ${await submitted.text()}`);
    }
    ({ task_id: taskId } = (await submitted.json()) as { task_id?: string });
    if (!taskId) throw new Error('Novita n’a pas rendu de task_id.');
    writeFileSync(ticket, taskId);
    log(`  clip   ${nom} — tâche ${taskId}`);
  }

  for (let attempt = 0; attempt < 90; attempt++) {
    // Une interrogation qui casse sur le réseau n'est pas un échec de la
    // tâche : on réessaie, le GPU travaille toujours de son côté.
    let res: Response;
    try {
      res = await fetch(
        `https://api.novita.ai/v3/async/task-result?task_id=${taskId}`,
        { headers: { Authorization: `Bearer ${key}` } }
      );
    } catch {
      await new Promise((r) => setTimeout(r, 5_000));
      continue;
    }

    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 5_000));
      continue;
    }

    const data = (await res.json()) as {
      payload?: { task?: { status?: string; reason?: string }; videos?: { video_url?: string }[] };
      task?: { status?: string };
      videos?: { video_url?: string }[];
    };
    const status = data.payload?.task?.status ?? data.task?.status;

    if (status === 'TASK_STATUS_SUCCEED') {
      const url = (data.payload?.videos ?? data.videos)?.[0]?.video_url;
      if (!url) throw new Error('Succès sans URL de vidéo.');
      // `curl` et non `fetch` : le client HTTP de Node part en ETIMEDOUT sur
      // l'hôte S3 de Novita, quand curl y récupère quatre mégaoctets en cinq
      // secondes. Le diagnostic a coûté trois relances, la ligne en coûte une.
      execFileSync('curl', ['-sSfL', '--max-time', '180', '-o', file, url], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      log(`  clip   ${nom} — ${(statSync(file).size / 1e6).toFixed(2)} Mo`);
      return file;
    }
    if (status === 'TASK_STATUS_FAILED') {
      throw new Error(`Novita a échoué : ${data.payload?.task?.reason ?? '?'}`);
    }
    await new Promise((r) => setTimeout(r, 6_000));
  }

  throw new Error(`Délai dépassé pour le clip ${nom}.`);
}
