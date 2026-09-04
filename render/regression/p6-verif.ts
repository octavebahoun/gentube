import { cpSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { toHyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from '@/lib/render/composition';
import { REFERENCE_VIDEO } from './fixtures';
import type { Shot } from '@/lib/db/schema';

// Harnais jetable palier 2, lot 36-40 : balisage + timeline injectes a la
// main, chemins wobbles rediges pour l occasion. Supprimer apres verification.

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
  instants: number[]
): void {
  const dir = mkdtempSync(join(tmpdir(), `gentube-p6-${nom}-`));
  for (const part of ['style.css', 'hyperframes.json', 'vendor']) {
    cpSync(join(COMPOSITION_DIR, part), join(dir, part), { recursive: true });
  }
  cpSync(join(HERE, 'media'), join(dir, 'media'), { recursive: true });
  cpSync(join(HERE, 'voice'), join(dir, 'voice'), { recursive: true });

  let page = composeHtml({ storyboard: toHyperframesStoryboard(VIDEO, [shot()]) });

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

  const sortie = join(dir, 'captures');
  execFileSync(
    'npx',
    ['hyperframes', 'snapshot', dir, '--at', instants.join(','), '--no-end', '--describe', 'false', '--no-browser-gpu', '-o', sortie],
    { stdio: 'inherit', timeout: 600_000 }
  );
  for (const f of readdirSync(sortie).filter((f) => f.endsWith('.png')).sort()) {
    cpSync(join(sortie, f), join('/tmp/opencode', `p6-${nom}-${f}`));
    console.log(`  capture /tmp/opencode/p6-${nom}-${f}`);
  }
}

const cible = process.argv[2] ?? 'all';
if (cible === 'all' || cible === 'box') {
  projet(
    'box',
    '<div class="hw-box" id="hb0" style="--hw-ink:#ffd9a0"><svg viewBox="0 0 100 62" preserveAspectRatio="none"><path id="hb0-0" d="M8,4 C30,2 60,5 92,3 Q98,3 97,10 C96,25 98,40 96,52 Q95,59 87,58 C60,60 30,57 9,59 Q2,59 3,51 C4,35 2,20 4,9 Q4,3 8,4 Z" pathLength="100" /></svg><div class="hw-label" id="hb0-l">Cotonou</div></div>',
    (t) => { t.scenes[0].hwBoxLabel = { at: 0.5, duration: 1.4, label: 'Cotonou', boil: 2 }; },
    [1.0, 1.7]
  );
}
if (cible === 'all' || cible === 'callout') {
  projet(
    'callout',
    '<div class="hw-callout" id="hc0" style="--hw-ink:#ffd9a0;left:35%;top:28%;width:30%;height:34%"><svg viewBox="0 0 100 100"><path id="hc0-0" d="M50,4 C75,5 95,25 94,52 C93,78 72,95 48,94 C24,93 5,75 6,50 C7,25 26,3 50,4 Z" pathLength="100" /></svg><div class="hw-label" id="hc0-l">ici !</div></div>',
    (t) => { t.scenes[0].hwCalloutCircle = { at: 0.5, duration: 1.4, label: 'ici !', boil: 2 }; },
    [1.7]
  );
}
if (cible === 'all' || cible === 'frame') {
  projet(
    'frame',
    '<div class="hw-frame" id="hf0" style="--hw-ink:#ffffff"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path id="hf0-0" d="M6,8 C30,6 70,9 93,7 Q95,7 94,12 L93,88 Q93,92 88,92 C60,94 30,90 8,93 Q5,93 6,88 L7,12 Q7,8 6,8 Z" pathLength="100" /><path id="hf0-1" d="M11,13 l5,5 m0,-5 l-5,5" pathLength="100" /><path id="hf0-2" d="M86,84 q4,-6 8,0 q-4,6 -8,0" pathLength="100" /></svg><div class="hw-caption" id="hf0-l">le marche, 6h</div></div>',
    (t) => { t.scenes[0].hwFrame = { at: 0.3, duration: 1.8, caption: 'le marche, 6h', boil: 1 }; },
    [1.9]
  );
}
if (cible === 'all' || cible === 'pipe') {
  projet(
    'pipe',
    '<div class="hw-pipe" id="hp0" style="--hw-ink:#ffd9a0"><div class="hw-node" id="hp0-n0"><div class="hw-label" id="hp0-l0">idee</div></div><div class="hw-node" id="hp0-n1"><div class="hw-label" id="hp0-l1">script</div></div><div class="hw-node" id="hp0-n2"><div class="hw-label" id="hp0-l2">montage</div></div><svg viewBox="0 0 100 40" preserveAspectRatio="none"><path id="hp0-c0" d="M31,20 C36,18 40,22 45,20" pathLength="100" /><path id="hp0-c1" d="M64,20 C69,22 73,18 78,20" pathLength="100" /></svg></div>',
    (t) => {
      t.scenes[0].hwPipeline = {
        at: 0.4, duration: 2.0, boil: 1,
        boxes: [{ at: 0.4 }, { at: 1.07 }, { at: 1.73 }],
        traits: [{ at: 0.73, duree: 0.34 }, { at: 1.4, duree: 0.33 }],
        labels: [{ at: 0.4 }, { at: 1.07 }, { at: 1.73 }],
      };
    },
    [1.5, 2.7]
  );
}
