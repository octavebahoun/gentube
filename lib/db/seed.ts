import { db, client } from './drizzle';
import { tenantDb } from './tenant-db';
import { projects, shots, tenants, users, videos } from './schema';
import { hashPassword } from '@/lib/auth/session';
import {
  estimateVideo,
  grantCredits,
  PLAN_MONTHLY_CREDITS,
} from '@/lib/credits';
import { estimateNarrationSeconds } from '@/lib/storyboard';

/**
 * Insère deux tenants pour que l'isolation soit visible dès le premier
 * lancement : toute action faite sur l'un ne doit jamais apparaître chez
 * l'autre.
 *
 * Connexion des deux comptes : mot de passe `admin123`.
 */
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

  const [video] = await studioDb.insert(videos, {
    projectId: project.id,
    title: 'Les Amazones du Dahomey',
    status: 'draft',
    resolution: '480p',
  });

  // Narration en français, prompts visuels en anglais, durées dérivées de la
  // narration — la même règle que suit le générateur. Elles restent
  // `estimated` tant que la voix off ne les a pas mesurées.
  await studioDb.insert(
    shots,
    [
      {
        order: 1,
        type: 'image' as const,
        narration:
          "Au XVIIe siècle, un royaume d'Afrique de l'Ouest confie sa garde à des femmes.",
        prompt: 'Wide establishing shot of the royal palace of Abomey at dawn.',
      },
      {
        order: 2,
        type: 'video' as const,
        narration:
          'On les appelle les Amazones. Elles s\'entraînent chaque jour, pieds nus, dans la poussière.',
        prompt: 'Amazon warriors training in formation, dust rising, slow motion.',
      },
      {
        order: 3,
        type: 'video' as const,
        narration:
          'Pendant deux ans, elles ont tenu tête à l\'armée française.',
        prompt: 'Close-up of a warrior tightening her belt, determined gaze.',
      },
      {
        order: 4,
        type: 'image' as const,
        narration: 'Aujourd\'hui, il ne reste que des murs. Et leur nom.',
        prompt: 'Sunset over the palace walls, silhouettes of guards.',
      },
    ].map((shot) => ({
      ...shot,
      videoId: video.id,
      durationS: estimateNarrationSeconds(shot.narration),
    }))
  );

  const { creditsEstimated } = await estimateVideo(studioDb, video.id);

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

  console.log('Seed summary');
  console.log('------------');
  console.log(
    `  Studio Cotonou (tenant ${studio.id}) — ${PLAN_MONTHLY_CREDITS.pro} credits`
  );
  console.log(`    owner@studio.test  / admin123  (owner)`);
  console.log(`    editor@studio.test / admin123  (member)`);
  console.log(
    `    project "${project.name}" -> video "${video.title}" (draft, ${creditsEstimated} credits estimated)`
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
