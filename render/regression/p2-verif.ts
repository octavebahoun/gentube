import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { REFERENCE_VIDEO } from './fixtures';
import type { Shot } from '@/lib/db/schema';

// Harnais jetable palier 2 : le palier 3 n'a pas encore applique
// passation/demandes.md, donc on injecte balisage + timeline a la main,
// exactement sous la forme demandee. Supprimer apres verification.

const HERE = resolve('render/regression');
const VIDEO = { ...REFERENCE_VIDEO, subtitles: false } as typeof REFERENCE_VIDEO;

function shot(): Shot {
  return {
    id: 1,
    order: 1,
    type: 'image',
    prompt: '',
    narration: 'un deux trois quatre cinq six',
    subtitle: null,
    audioUrl: 'voice/scene-1.mp3',
    assetUrl: 'media/scene-1.jpg',
    sourceImageUrl: null,
    durationS: 4,
    durationSource: 'measured',
    words: null,
    render: { effects: { transition: 'none', zoom: 'in' } },
  } as unknown as Shot;
}

function projet(
  nom: string,
  divs: string,
  patch: (t: { scenes: Record<string, unknown>[] }) => void,
  instants: number[],
  opts: { texte?: boolean; karaoke?: boolean } = {}
): string {
  const dir = mkdtempSync(join(tmpdir(), `gentube-p2-${nom}-`));
  for (const part of ['style.css', 'hyperframes.json', 'vendor']) {
    cpSync(join(COMPOSITION_DIR, part), join(dir, part), { recursive: true });
  }
  cpSync(join(HERE, 'media'), join(dir, 'media'), { recursive: true });
  cpSync(join(HERE, 'voice'), join(dir, 'voice'), { recursive: true });

  let page = composeHtml({
    storyboard: toHyperframesStoryboard(
      opts.texte ? ({ ...REFERENCE_VIDEO, subtitles: opts.karaoke ?? true } as typeof REFERENCE_VIDEO) : VIDEO,
      [opts.texte
        ? ({ ...shot(), render: { effects: { transition: 'none', zoom: 'in' }, kineticTitle: { text: 'TITRE PULSE', variant: 'reveal', position: 'center' } } } as unknown as Shot)
        : shot()]
    ),
  });

  // Apres le media, jamais avant : un .media opaque couvre ses petits freres.
  // C est aussi ce que dit la demande palier 3 — dans .scene, apres flash.
  const media = page.indexOf('id="m0"');
  const finMedia = page.indexOf('</div>', media) + '</div>'.length;
  page = page.slice(0, finMedia) + '\n      ' + divs + page.slice(finMedia);

  const m = /const T = (\{.*?\});/s.exec(page);
  if (!m) throw new Error('timeline introuvable');
  const t = JSON.parse(m[1]) as { scenes: Record<string, unknown>[] };
  patch(t);
  page = page.replace(m[0], `const T = ${JSON.stringify(t).replace(/<\//g, '<\\/')};`);

  writeFileSync(join(dir, 'index.html'), page);
  console.log(`projet ${nom} : ${dir}`);

  try {
    execFileSync('npx', ['hyperframes', 'validate', dir], { stdio: 'inherit', timeout: 120_000 });
  } catch { /* validate signale, snapshot tranche */ }

  const sortie = join(dir, 'captures');
  execFileSync(
    'npx',
    ['hyperframes', 'snapshot', dir, '--at', instants.join(','), '--no-end', '--describe', 'false', '--no-browser-gpu', '-o', sortie],
    { stdio: 'inherit', timeout: 600_000 }
  );
  for (const f of readdirSync(sortie).filter((f) => f.endsWith('.png')).sort()) {
    cpSync(join(sortie, f), join('/tmp/opencode', `p2-${nom}-${f}`));
    console.log(`  capture /tmp/opencode/p2-${nom}-${f}`);
  }
  return dir;
}

const cible = process.argv[2] ?? 'all';
if (cible === 'all' || cible === 'sweep') {
  projet(
    'sweep',
    '<div class="light-sweep" id="ls0" style="--sweep-color:#ffd9a0"></div>',
    (t) => { t.scenes[0].lightSweep = { at: 1.0, duration: 0.9, color: '#ffd9a0' }; },
    [1.45, 2.5]
  );
}
if (cible === 'all' || cible === 'grain') {
  projet(
    'grain',
    '<div class="grain" id="gr0"></div>',
    (t) => { t.scenes[0].grain = { at: 0, duration: 5, opacity: 0.3 }; },
    [1.5, 3.5]
  );
}
if (cible === 'all' || cible === 'beat') {
  projet(
    'beat',
    '',
    (t) => { t.scenes[0].beatAccent = { at: 1.0, duration: 0.4, strength: 0.06 }; },
    [1.2, 2.0],
    { texte: true, karaoke: false }
  );
}
// Silence l'import sinon inutilise en mode cible unique.
void readFileSync;
