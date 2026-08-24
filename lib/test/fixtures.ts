import { client, db } from '@/lib/db/drizzle';
import { resetDatabase } from '@/lib/db/reset';
import { tenantDb, type TenantDb } from '@/lib/db/tenant-db';
import {
  projects,
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
  { plan = 'starter', credits = 0 }: { plan?: Plan; credits?: number } = {}
): Promise<TenantDb> {
  const [tenant] = await db
    .insert(tenants)
    .values({ name, plan, creditsBalance: credits })
    .returning();
  return tenantDb(tenant.id);
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
