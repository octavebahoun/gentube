import { cpSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { REFERENCE_VIDEO } from './fixtures';
import type { Shot } from '@/lib/db/schema';

// Harnais jetable palier 2, lot 3 : balisage + timeline injectes a la main,
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
  opts: { fond?: boolean; sansMedia?: boolean } = {}
): void {
  const dir = mkdtempSync(join(tmpdir(), `gentube-p4-${nom}-`));
  for (const part of ['style.css', 'hyperframes.json', 'vendor']) {
    cpSync(join(COMPOSITION_DIR, part), join(dir, part), { recursive: true });
  }
  cpSync(join(HERE, 'media'), join(dir, 'media'), { recursive: true });
  cpSync(join(HERE, 'voice'), join(dir, 'voice'), { recursive: true });

  const plan = shot();
  if (opts.sansMedia) plan.assetUrl = null;
  let page = composeHtml({ storyboard: toHyperframesStoryboard(VIDEO, [plan]) });

  if (opts.fond) {
    // Un fond passe avant le media : le media le recouvre quand il y en a un.
    const open = page.indexOf('id="s0"');
    const gt = page.indexOf('>', open);
    page = page.slice(0, gt + 1) + '\n      ' + divs + page.slice(gt + 1);
  } else {
    // Un .media opaque couvre ses petits freres : apres lui, jamais avant.
    const media = page.indexOf('id="m0"');
    const finMedia = page.indexOf('</div>', media) + '</div>'.length;
    page = page.slice(0, finMedia) + '\n      ' + divs + page.slice(finMedia);
  }

  const m = /const T = (\{.*?\});/s.exec(page);
  if (!m) throw new Error('timeline introuvable');
  const t = JSON.parse(m[1]) as { scenes: Record<string, unknown>[] };
  patch(t);
  page = page.replace(m[0], `const T = ${JSON.stringify(t).replace(/<\//g, '<\\/')};`);

  writeFileSync(join(dir, 'index.html'), page);
  console.log(`projet ${nom} : ${dir}`);

  const sortie = join(dir, 'captures');
  execFileSync(
    'npx',
    ['hyperframes', 'snapshot', dir, '--at', instants.join(','), '--no-end', '--describe', 'false', '--no-browser-gpu', '-o', sortie],
    { stdio: 'inherit', timeout: 600_000 }
  );
  for (const f of readdirSync(sortie).filter((f) => f.endsWith('.png')).sort()) {
    cpSync(join(sortie, f), join('/tmp/opencode', `p4-${nom}-${f}`));
    console.log(`  capture /tmp/opencode/p4-${nom}-${f}`);
  }
}

const cible = process.argv[2] ?? 'all';
if (cible === 'all' || cible === 'grid') {
  // Plan sans image : sans media, la grille est seule visible.
  projet(
    'grid',
    '<div class="grid-drift" id="gd0"></div>',
    (t) => { t.scenes[0].gridDrift = { at: 0, duration: 5, opacity: 0.5 }; },
    [2.5],
    { fond: true, sansMedia: true }
  );
}
if (cible === 'all' || cible === 'cursor') {
  projet(
    'cursor',
    '<div class="cursor-click" id="cc0"><div class="cursor-ring"></div></div>',
    (t) => {
      t.scenes[0].cursorClick = { at: 0.5, duration: 1.4, fromX: 12, fromY: 12, x: 62, y: 55 };
    },
    [1.0, 1.3, 2.2]
  );
}
if (cible === 'all' || cible === 'gate') {
  projet(
    'gate',
    '<div class="scan-gate" id="sg0" style="--gate-color:#4ad9ff"><div class="scan-line"></div><i class="gate-corner tl"></i><i class="gate-corner tr"></i><i class="gate-corner bl"></i><i class="gate-corner br"></i></div>',
    (t) => { t.scenes[0].scanGate = { at: 0.5, duration: 1.6 }; },
    [1.0, 2.5]
  );
}
