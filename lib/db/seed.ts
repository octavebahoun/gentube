import { db, client } from './drizzle';
import { tenantDb } from './tenant-db';
import { projects, shots, tenants, users, videos } from './schema';
import { hashPassword } from '@/lib/auth/session';
import {
  estimateVideo,
  grantCredits,
  PLAN_MONTHLY_CREDITS,
} from '@/lib/credits';

/**
 * Seeds two tenants so tenant isolation is visible from the first run:
 * anything done as one must never surface for the other.
 *
 * Login for both accounts: password `admin123`.
 */
async function seed() {
  const passwordHash = await hashPassword('admin123');

  // --- Tenant bootstrap (the one place that legitimately runs unscoped) ---
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

  // --- Everything below goes through the tenant-scoped wrapper ---
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

  await studioDb.insert(
    shots,
    [
      {
        order: 1,
        type: 'image' as const,
        prompt: 'Wide establishing shot of the royal palace of Abomey at dawn.',
        durationS: 6,
      },
      {
        order: 2,
        type: 'video' as const,
        prompt: 'Amazon warriors training in formation, dust rising, slow motion.',
        durationS: 8,
      },
      {
        order: 3,
        type: 'video' as const,
        prompt: 'Close-up of a warrior tightening her belt, determined gaze.',
        durationS: 5,
      },
      {
        order: 4,
        type: 'image' as const,
        prompt: 'Sunset over the palace walls, silhouettes of guards.',
        durationS: 6,
      },
    ].map((shot) => ({ ...shot, videoId: video.id }))
  );

  const { creditsEstimated } = await estimateVideo(studioDb, video.id);

  // A second tenant with its own project, to make isolation testable by hand.
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
