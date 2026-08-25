import { db, client } from './drizzle';
import { eq, tenantDb } from './tenant-db';
import { projects, shots, tenants, users, videos } from './schema';
import { hashPassword } from '@/lib/auth/session';
import {
  estimateVideo,
  grantCredits,
  PLAN_MONTHLY_CREDITS,
  refundVideo,
  validateAndChargeVideo,
} from '@/lib/credits';
import {
  estimateNarrationSeconds,
  type WordTiming,
} from '@/lib/storyboard';

/**
 * Insère deux tenants pour que l'isolation soit visible dès le premier
 * lancement : toute action faite sur l'un ne doit jamais apparaître chez
 * l'autre.
 *
 * Le tenant Studio Cotonou porte en plus le corpus de fixtures : une même
 * histoire (« Les Amazones du Dahomey ») déclinée aux quatre états que l'UI
 * doit savoir afficher — brouillon estimé, génération en cours, échec,
 * publiée. Les plans des trois vidéos avancées sont mesurés : durées à ~14
 * caractères/seconde, timings mot à mot (`words`) pour le karaoké, clés R2
 * bidon mais bien formées pour `audio_url` / `asset_url`.
 *
 * Connexion des deux comptes : mot de passe `admin123`.
 */

// ---------------------------------------------------------------------------
// Le corpus partagé — six scènes, narration française, prompts anglais.
// ---------------------------------------------------------------------------

type SceneSpec = {
  type: 'image' | 'video';
  narration: string;
  prompt: string;
  /** Mise en scène valide selon `sceneRenderSchema` (lib/storyboard/render.ts). */
  effects?: Record<string, unknown>;
};

const SCENES: SceneSpec[] = [
  {
    type: 'image',
    narration:
      "Au dix-septième siècle, dans le royaume du Dahomey, le roi règne entouré d'une garde entièrement féminine.",
    prompt:
      'Wide establishing shot of the royal palace of Abomey at dawn, red earthen walls, golden harmattan light.',
    effects: { zoom: 'in', transition: 'fade', cameraMotion: 'static' },
  },
  {
    type: 'video',
    narration:
      "On les appelle les Agodjié. Elles s'entraînent chaque jour, pieds nus, dans la poussière de la cour royale.",
    prompt:
      'Amazon warriors drilling in formation in the dusty palace courtyard, spears raised, slow motion dust clouds.',
    effects: { zoom: 'out', transition: 'slide', cameraMotion: 'dolly' },
  },
  {
    type: 'image',
    narration:
      'Leur seule réputation fait trembler les royaumes voisins bien avant la première bataille.',
    prompt:
      'Close-up portrait of an Amazon warrior tightening her belt, determined gaze, shallow depth of field.',
    effects: { transition: 'wipe', cameraMotion: 'pan' },
  },
  {
    type: 'video',
    narration:
      "Quand l'armée française débarque, elles tiennent la ligne deux ans durant et refusent chaque assaut.",
    prompt:
      'Battlefield at dusk, Amazon warriors charging through gun smoke, dynamic tracking shot, motion blur.',
    effects: { transition: 'zoomPunch', shake: true },
  },
  {
    type: 'image',
    narration:
      'Les archives coloniales elles-mêmes décriront leur discipline et leur courage sans équivalent.',
    prompt:
      'Old colonial-era journals and hand-drawn maps spread across a wooden table, candlelight, slow reveal.',
    effects: { transition: 'fade', zoom: 'in' },
  },
  {
    type: 'image',
    narration:
      "Aujourd'hui, il ne reste que des murs. Et un nom que le Bénin tout entier continue de porter.",
    prompt:
      'Sunset over the crumbling mud walls of Abomey, long silhouettes of women guards, warm film grain, fading light.',
    effects: { transition: 'black' },
  },
];

/**
 * Répartit les mots sur la durée mesurée, au prorata de leur longueur hors
 * ponctuation — la même contiguïté que l'alignement réel d'ElevenLabs :
 * chaque mot commence là où le précédent finit, avec un court silence
 * d'amorce et une queue sur la fin de scène. Assez fidèle pour développer
 * le karaoké sans dépendre d'un appel fournisseur.
 */
function wordTimings(narration: string, durationS: number): WordTiming[] {
  const tokens = narration.trim().split(/\s+/);
  const weights = tokens.map((token) => {
    const letters = token.replace(/[\p{P}\p{S}]/gu, '');
    return Math.max(letters.length, 1);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  const LEAD_IN_S = 0.06;
  const MIN_WORD_S = 0.04;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const speakable = Math.max(durationS - 2 * LEAD_IN_S, tokens.length * MIN_WORD_S);

  const timings: WordTiming[] = [];
  let cursor = LEAD_IN_S;
  tokens.forEach((text, index) => {
    const start = round2(cursor);
    const raw = (weights[index] / totalWeight) * speakable;
    // Le dernier mot ne peut pas déborder de la scène, quelle que soit la
    // dérive d'arrondi des précédents.
    const remaining = durationS - start;
    const duration = Math.max(
      round2(index === tokens.length - 1 ? Math.min(raw, remaining) : raw),
      MIN_WORD_S
    );
    timings.push({ text, start, duration });
    cursor = start + duration;
  });
  return timings;
}

/** Champs communs à un plan, quel que soit son état. */
function baseShot(videoId: number, order: number, spec: SceneSpec) {
  return {
    videoId,
    order,
    type: spec.type,
    prompt: spec.prompt,
    narration: spec.narration,
    durationS: estimateNarrationSeconds(spec.narration),
    ...(spec.effects ? { render: { effects: spec.effects } } : {}),
  };
}

/** Un plan tel que le générateur de storyboard l'écrit : estimé, rien d'autre. */
function draftShot(videoId: number, order: number, spec: SceneSpec) {
  return { ...baseShot(videoId, order, spec), durationSource: 'estimated' as const };
}

/**
 * Un plan tel que la voix off puis les visuels l'ont écrit : durée mesurée,
 * alignement mot à mot, clé audio et clé visuelle au format `assetKey()`.
 * Les clés sont bidon mais respectent le préfixe tenant et la convention
 * `<tenant>/videos/<vidéo>/scene-<plan>.*` du pipeline.
 */
function measuredShot(tenantId: number, videoId: number, order: number, spec: SceneSpec) {
  const durationS = estimateNarrationSeconds(spec.narration);
  return {
    ...baseShot(videoId, order, spec),
    durationSource: 'measured' as const,
    words: wordTimings(spec.narration, durationS),
    audioUrl: `${tenantId}/videos/${videoId}/scene-${order}.mp3`,
    assetUrl:
      spec.type === 'image'
        ? `${tenantId}/videos/${videoId}/scene-${order}.png`
        : `${tenantId}/videos/${videoId}/scene-${order}.mp4`,
    status: 'ready' as const,
  };
}

async function seed() {
  const passwordHash = await hashPassword('admin123');

  // --- Amorçage des tenants (le seul endroit légitimement sans scope) ---
  const [studio, demo] = await db
    .insert(tenants)
    .values([
      { name: 'Studio Cotonou', plan: 'pro' },
      { name: 'Kanal Demo', plan: 'starter' },
    ])
    .returning();

  await db.insert(users).values([
    {
      tenantId: studio.id,
      name: 'Awa Owner',
      email: 'owner@studio.test',
      passwordHash,
      role: 'owner',
    },
    {
      tenantId: studio.id,
      name: 'Koffi Editor',
      email: 'editor@studio.test',
      passwordHash,
      role: 'member',
    },
    {
      tenantId: demo.id,
      name: 'Demo Owner',
      email: 'owner@demo.test',
      passwordHash,
      role: 'owner',
    },
  ]);
  console.log(`Created tenants ${studio.id} (pro) and ${demo.id} (starter).`);

  // --- Tout ce qui suit passe par le wrapper scopé au tenant ---
  const studioDb = tenantDb(studio.id);
  const demoDb = tenantDb(demo.id);

  await grantCredits(studioDb, {
    amount: PLAN_MONTHLY_CREDITS.pro,
    reason: 'subscription_grant',
    idempotencyKey: `tenant:${studio.id}:seed_grant`,
  });
  await grantCredits(demoDb, {
    amount: PLAN_MONTHLY_CREDITS.starter,
    reason: 'subscription_grant',
    idempotencyKey: `tenant:${demo.id}:seed_grant`,
  });

  const [project] = await studioDb.insert(projects, {
    name: 'Histoires du Bénin',
    defaultPipeline: 'mixed',
    voiceId: 'elevenlabs:rachel',
    youtubeChannelId: null,
    stylePrompt:
      'Cinematic documentary, warm golden light, West African landscapes, 35mm film grain.',
  });

  const THEME = "Les Amazones du Dahomey, l'armée féminine du royaume";

  // --- Variante 1 : brouillon brut, durées estimées, aucune media généré ---
  const [draft] = await studioDb.insert(videos, {
    projectId: project.id,
    title: 'Les Amazones du Dahomey (brouillon)',
    theme: THEME,
    status: 'draft',
    resolution: '480p',
  });
  await studioDb.insert(
    shots,
    SCENES.map((spec, index) => draftShot(draft.id, index + 1, spec))
  );
  const { creditsEstimated } = await estimateVideo(studioDb, draft.id);

  /**
   * Crée une vidéo dont toutes les scènes sont mesurées et facturées —
   * exactement ce que produit le pipeline après voix off + validation.
   * La facturation passe par les vraies fonctions du grand livre, donc le
   * solde du tenant reste cohérent avec ses écritures.
   */
  async function createChargedVideo(title: string, resolution: '480p' | '720p') {
    const [video] = await studioDb.insert(videos, {
      projectId: project.id,
      title,
      theme: THEME,
      status: 'draft',
      resolution,
    });
    const inserted = await studioDb.insert(
      shots,
      SCENES.map((spec, index) => measuredShot(studio.id, video.id, index + 1, spec))
    );
    const { charged } = await validateAndChargeVideo(studioDb, video.id);
    return { video, inserted, charged };
  }

  // --- Variante 2 : en production — visuels des dernières scènes cuisent ---
  const generating = await createChargedVideo(
    'Les Amazones du Dahomey (production)',
    '480p'
  );
  await studioDb.update(
    shots,
    { assetUrl: null, status: 'generating', updatedAt: new Date() },
    eq(shots.id, generating.inserted[4].id)
  );
  await studioDb.update(
    shots,
    { assetUrl: null, status: 'pending', updatedAt: new Date() },
    eq(shots.id, generating.inserted[5].id)
  );
  await studioDb.update(
    videos,
    { status: 'generating', updatedAt: new Date() },
    eq(videos.id, generating.video.id)
  );

  // --- Variante 3 : échouée — la dernière scène a planté, le reste remboursé ---
  const failed = await createChargedVideo('Les Amazones du Dahomey (échec)', '480p');
  await studioDb.update(
    shots,
    { assetUrl: null, status: 'failed', updatedAt: new Date() },
    eq(shots.id, failed.inserted[5].id)
  );
  await refundVideo(studioDb, failed.video.id);

  // --- Variante 4 : publiée — complète, en 720p, renvoyée vers YouTube ---
  const published = await createChargedVideo('Les Amazones du Dahomey', '720p');
  await studioDb.update(
    videos,
    {
      status: 'published',
      youtubeVideoId: 'aZx1K9pQ7mE',
      publishedAt: new Date(),
      updatedAt: new Date(),
    },
    eq(videos.id, published.video.id)
  );

  // Un second tenant avec son propre projet, pour que l'isolation soit
  // vérifiable à la main.
  const [demoProject] = await demoDb.insert(projects, {
    name: 'Demo Shorts',
    defaultPipeline: 'image',
    stylePrompt: 'Flat vector illustration, bold colours.',
  });
  await demoDb.insert(videos, {
    projectId: demoProject.id,
    title: 'Demo video',
    status: 'draft',
    resolution: '720p',
  });

  const balance = await studioDb.getTenant();
  console.log('Seed summary');
  console.log('------------');
  console.log(
    `  Studio Cotonou (tenant ${studio.id}) — ${PLAN_MONTHLY_CREDITS.pro} credits granted, ${balance?.creditsBalance} left`
  );
  console.log(`    owner@studio.test  / admin123  (owner)`);
  console.log(`    editor@studio.test / admin123  (member)`);
  console.log(`    project "${project.name}" ->`);
  console.log(
    `      "${draft.title}" (draft, estimated, ${draft.creditsEstimated} credits)`
  );
  console.log(
    `      "${generating.video.title}" (generating, ${generating.charged} credits charged)`
  );
  console.log(
    `      "${failed.video.title}" (failed, ${failed.charged} credits refunded)`
  );
  console.log(
    `      "${published.video.title}" (published, 720p, youtube aZx1K9pQ7mE, ${published.charged} credits)`
  );
  console.log(
    `  Kanal Demo (tenant ${demo.id}) — ${PLAN_MONTHLY_CREDITS.starter} credits`
  );
  console.log(`    owner@demo.test    / admin123  (owner)`);
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
    console.log('Seed process finished.');
    process.exit(0);
  });
