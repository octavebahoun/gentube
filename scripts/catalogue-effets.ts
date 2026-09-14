/**
 * Banc d'essai des effets p-video.
 *
 * But : bâtir un catalogue d'effets visuels en gardant l'image FIXE et en ne
 * faisant varier que le prompt d'animation. On génère une image de référence
 * une fois (flux), puis chaque prompt part sur `prunaai/p-video` en 5 s draft,
 * et le MP4 revient en local dans `catalogue/`.
 *
 *   pnpm tsx scripts/catalogue-effets.ts image "<prompt image>"
 *   pnpm tsx scripts/catalogue-effets.ts clip  "<prompt animation>"
 *
 * L'image passe à Replicate en data URI : pas de R2, le script est autonome.
 * On sonde la prédiction (pas de webhook) et on respecte le 429 du throttle.
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WorkersAiImageClient } from '@/lib/images/flux';

const OUT = path.resolve('catalogue');
const REF = path.join(OUT, 'reference.png');
const REPLICATE = 'https://api.replicate.com/v1';
const MODEL = 'prunaai/p-video';
const DUREE_S = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN?.trim();
  if (!t) throw new Error('REPLICATE_API_TOKEN manquant (vérifie .env).');
  return t;
}

/** Un appel Replicate, avec reprise sur 429 (le throttle sous 5 $ de crédit). */
async function replicate(
  chemin: string,
  init: RequestInit = {}
): Promise<Record<string, any>> {
  for (let essai = 0; ; essai++) {
    let res: Response;
    try {
      res = await fetch(`${REPLICATE}${chemin}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    } catch (cause) {
      // Coupure réseau transitoire : on retente quelques fois avant d'abandonner.
      if (essai < 5) {
        console.log(`  réseau instable (${cause}), je retente dans 5s…`);
        await sleep(5000);
        continue;
      }
      throw new Error(`Replicate injoignable : ${cause}`);
    }
    if (res.status === 429 && essai < 8) {
      const attente = Number(res.headers.get('retry-after')) || 10;
      console.log(`  429 (throttle) — j'attends ${attente}s puis je rejoue…`);
      await sleep(attente * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Replicate ${res.status} : ${(await res.text()).slice(0, 400)}`);
    }
    return (await res.json()) as Record<string, any>;
  }
}

/** Génère une image flux, avec reprise sur coupure réseau (connexion instable). */
async function genererImageBytes(prompt: string) {
  const client = new WorkersAiImageClient();
  for (let essai = 0; ; essai++) {
    try {
      return await client.generate({ prompt, ratio: '16:9' });
    } catch (cause) {
      if (essai < 4) {
        console.log(`  flux instable (${cause}), je retente dans 5s…`);
        await sleep(5000);
        continue;
      }
      throw cause;
    }
  }
}

/** Étape une fois : l'image de référence, figée pour tout le catalogue. */
async function genererImage(prompt: string): Promise<void> {
  if (!prompt.trim()) throw new Error('Donne un prompt d\'image.');
  await mkdir(OUT, { recursive: true });
  console.log('Génération de l\'image de référence (flux)…');
  const image = await genererImageBytes(prompt);
  await writeFile(REF, image.bytes);
  console.log(
    `✅ Référence : ${REF} — ${image.width}×${image.height}, ${(image.bytes.length / 1024).toFixed(0)} Ko`
  );
}

async function imageEnDataUri(): Promise<string> {
  const octets = await readFile(REF);
  return `data:image/png;base64,${octets.toString('base64')}`;
}

function slug(texte: string): string {
  return (
    texte
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'clip'
  );
}

/** Anime une image (data URI) avec un prompt → écrit un MP4, rend son chemin. */
async function animer(image: string, prompt: string, base: string): Promise<string> {
  // Pleine qualité par défaut (0,04 $/s) ; EFFET_DRAFT=1 repasse en draft
  // (0,01 $/s) pour dégrossir un prompt sans payer le prix fort.
  const draft = process.env.EFFET_DRAFT === '1';
  const cout = (DUREE_S * (draft ? 0.01 : 0.04)).toFixed(2);
  console.log(
    `Soumission p-video — 5 s, ${draft ? 'draft' : '1080p pleine qualité'} (~${cout} $)\n  prompt : ${prompt}`
  );
  const depart = await replicate(`/models/${MODEL}/predictions`, {
    method: 'POST',
    body: JSON.stringify({
      input: {
        image,
        prompt,
        resolution: '1080p',
        duration: DUREE_S,
        aspect_ratio: '16:9',
        draft,
      },
    }),
  });

  const id = depart.id as string;
  let statut = depart.status as string;
  let sortie = depart.output;
  const t0 = Date.now();

  process.stdout.write('  rendu ');
  while (['starting', 'processing', 'queued'].includes(statut)) {
    if (Date.now() - t0 > 10 * 60 * 1000) throw new Error('Délai dépassé (10 min).');
    await sleep(5000);
    const p = await replicate(`/predictions/${id}`);
    statut = p.status as string;
    sortie = p.output;
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  if (statut !== 'succeeded') {
    throw new Error(`Échec (${statut}) : ${JSON.stringify(depart.error ?? statut)}`);
  }

  const url = Array.isArray(sortie) ? sortie[0] : sortie;
  if (typeof url !== 'string') throw new Error('Pas d\'URL de sortie.');
  let bin: Buffer | null = null;
  for (let essai = 0; essai < 5; essai++) {
    try {
      bin = Buffer.from(await (await fetch(url)).arrayBuffer());
      break;
    } catch (cause) {
      console.log(`  téléchargement instable (${cause}), je retente dans 5s…`);
      await sleep(5000);
    }
  }
  if (!bin) throw new Error('Téléchargement du MP4 impossible (réseau).');
  const dest = path.join(OUT, `${base}.mp4`);
  await writeFile(dest, bin);
  console.log(`✅ Vidéo : ${dest} — ${(bin.length / 1024 / 1024).toFixed(1)} Mo`);
  return dest;
}

/** Anime l'image de référence figée (mode « effet isolé »). */
async function genererClip(prompt: string): Promise<void> {
  if (!prompt.trim()) throw new Error('Donne un prompt d\'animation.');
  if (!existsSync(REF)) {
    throw new Error('Pas d\'image de référence. Lance d\'abord : image "<prompt>".');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await animer(await imageEnDataUri(), prompt, `${stamp}-${slug(prompt)}`);
}

/**
 * Une scène complète : une image TAILLÉE pour le mouvement, puis l'animation.
 *
 * C'est le mode par défaut du catalogue : un cadrage figé ne va pas à tous les
 * plans (un tilt vers le haut veut une image qui montre les pieds), donc on
 * génère l'image dans le sens du prompt, on l'anime, et on garde les deux
 * fichiers côte à côte. Les deux prompts sont séparés par «  :::  ».
 */
async function genererScene(imgPrompt: string, animPrompt: string): Promise<void> {
  if (!imgPrompt?.trim() || !animPrompt?.trim()) {
    throw new Error('Usage : scene "<prompt image> ::: <prompt animation>".');
  }
  await mkdir(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = `${stamp}-${slug(animPrompt)}`;

  console.log('Image taillée pour le mouvement (flux)…');
  const img = await genererImageBytes(imgPrompt);
  const pngPath = path.join(OUT, `${base}.png`);
  await writeFile(pngPath, img.bytes);
  console.log(`  image : ${pngPath} — ${img.width}×${img.height}`);

  const dataUri = `data:image/png;base64,${img.bytes.toString('base64')}`;
  await animer(dataUri, animPrompt, base);
}

async function main(): Promise<void> {
  const [cmd, ...reste] = process.argv.slice(2);
  const arg = reste.join(' ');
  if (cmd === 'image') return genererImage(arg);
  if (cmd === 'clip') return genererClip(arg);
  if (cmd === 'scene') {
    const [img, anim] = arg.split(' ::: ');
    return genererScene(img, anim);
  }
  console.error(
    'Usage :\n  tsx scripts/catalogue-effets.ts scene "<prompt image> ::: <prompt animation>"\n' +
      '  tsx scripts/catalogue-effets.ts image "<prompt image>"\n' +
      '  tsx scripts/catalogue-effets.ts clip  "<prompt animation>"'
  );
  process.exit(1);
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e);
  process.exit(1);
});
