import { client, db } from '@/lib/db/drizzle';
import { resetDatabase } from '@/lib/db/reset';
import { tenantDb, type TenantDb } from '@/lib/db/tenant-db';
import {
  type CreditPocket,
  projects,
  subscriptions,
  tenants,
  videos,
  type Plan,
  type Resolution,
} from '@/lib/db/schema';

export async function resetDb() {
  await resetDatabase();
}

export async function closeDb() {
  await client.end();
}

/** Crée un tenant et rend un handle scopé pour lui. */
export async function createTenant(
  name: string,
  {
    plan = 'starter',
    credits = 0,
    pocket = 'plan',
  }: { plan?: Plan; credits?: number; pocket?: CreditPocket } = {}
): Promise<TenantDb> {
  // L'invariant du solde est `credits_balance = credits_plan + credits_topup`.
  // Poser un solde sans remplir de poche donnait un tenant qui affiche des
  // crédits et ne peut rien débiter.
  const [tenant] = await db
    .insert(tenants)
    .values({
      name,
      plan,
      creditsBalance: credits,
      creditsPlan: pocket === 'plan' ? credits : 0,
      creditsTopup: pocket === 'topup' ? credits : 0,
    })
    .returning();
  return tenantDb(tenant.id);
}

/**
 * Donne au tenant un abonnement actif, ce qui débloque le 720p et retire le
 * filigrane. Sans lui, un tenant de test est en essai.
 */
export async function subscribe(
  tdb: TenantDb,
  plan: Plan = 'pro'
): Promise<void> {
  await db.insert(subscriptions).values({
    tenantId: tdb.tenantId,
    plan,
    status: 'active',
  });
}

/** Un projet plus une vidéo en brouillon, pour les tests qui ont besoin de quelque chose à scoper. */
export async function createProjectWithVideo(
  tdb: TenantDb,
  {
    title = 'Test video',
    resolution = '480p',
  }: { title?: string; resolution?: Resolution } = {}
) {
  const [project] = await tdb.insert(projects, { name: `${title} project` });
  const [video] = await tdb.insert(videos, {
    projectId: project.id,
    title,
    resolution,
  });
  return { project, video };
}
