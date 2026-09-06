import { client, db } from '@/lib/db/drizzle';
import { resetDatabase } from '@/lib/db/reset';
import { tenantDb, type TenantDb } from '@/lib/db/tenant-db';
import {
  billingCycles,
  type CreditPocket,
  projects,
  subscriptions,
  tenants,
  videos,
  type Plan,
  type Quality,
} from '@/lib/db/schema';
import { PLAN_MONTHLY_CREDITS, PLAN_PRICE_FCFA } from '@/lib/credits/pricing';
import { cyclePeriodEnd } from '@/lib/billing/plans';

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
 * Donne au tenant un abonnement actif : le palier Cinéma se débloque et le
 * filigrane tombe. Sans lui, un tenant de test est en essai.
 *
 * Le **cycle de facturation** vient avec, parce qu'il vient avec en
 * production : `createSubscriptionCheckout` en ouvre un à chaque encaissement.
 * Sans lui, le plafond de Cinéma n'aurait rien sur quoi compter et les tests
 * auraient certifié un garde-fou qui ne s'applique jamais.
 *
 * `cycle: false` pour le cas où on veut précisément un abonné sans cycle.
 */
export async function subscribe(
  tdb: TenantDb,
  plan: Plan = 'pro',
  { cycle = true, debutIlYaJours = 0 }: { cycle?: boolean; debutIlYaJours?: number } = {}
): Promise<void> {
  const [subscription] = await db
    .insert(subscriptions)
    .values({ tenantId: tdb.tenantId, plan, status: 'active' })
    .returning();

  if (!cycle) return;

  const periodStart = new Date(Date.now() - debutIlYaJours * 24 * 60 * 60 * 1000);
  await db.insert(billingCycles).values({
    tenantId: tdb.tenantId,
    subscriptionId: subscription.id,
    plan,
    periodStart,
    periodEnd: cyclePeriodEnd(periodStart),
    amountXof: PLAN_PRICE_FCFA[plan] ?? 0,
    creditsGranted: PLAN_MONTHLY_CREDITS[plan],
    status: 'paid',
  });
}

/** Un projet plus une vidéo en brouillon, pour les tests qui ont besoin de quelque chose à scoper. */
export async function createProjectWithVideo(
  tdb: TenantDb,
  {
    title = 'Test video',
    quality = 'draft',
  }: { title?: string; quality?: Quality } = {}
) {
  const [project] = await tdb.insert(projects, { name: `${title} project` });
  const [video] = await tdb.insert(videos, {
    projectId: project.id,
    title,
    quality,
  });
  return { project, video };
}
