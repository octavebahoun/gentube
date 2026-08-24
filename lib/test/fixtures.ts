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

/** Creates a tenant and hands back a scoped handle for it. */
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

/** A project plus a draft video, for tests that need something to scope. */
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
