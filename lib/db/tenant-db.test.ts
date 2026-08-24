import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { projects, shots, tenants, users, videos } from './schema';
import {
  TENANT_SCOPED_TABLES,
  TenantScopeViolationError,
  tenantDb,
  type TenantScopedTable,
} from './tenant-db';
import {
  closeDb,
  createProjectWithVideo,
  createTenant,
  resetDb,
} from '@/lib/test/fixtures';

// Un client postgres partagé par worker : fermé une fois, après l'exécution
// de toutes les suites de ce fichier.
afterAll(async () => {
  await closeDb();
});

/**
 * Tables légitimement sans colonne tenant_id : la ligne du tenant elle-même,
 * et la bibliothèque de sons partagée — un catalogue d'actifs plateforme
 * n'appartenant à aucun client et lisible par tous.
 */
const UNSCOPED_TABLES = new Set(['tenants', 'sound_assets']);

describe('tenantDb — schema coverage', () => {
  it('registers every tenant-owned table', () => {
    const allTables = (Object.values(schema) as unknown[]).filter(
      (value): value is PgTable => is(value, PgTable)
    );
    const registered = new Set<string>(
      TENANT_SCOPED_TABLES.map((table) => getTableName(table))
    );

    const missing = allTables
      .map((table) => getTableName(table))
      .filter((name) => !UNSCOPED_TABLES.has(name) && !registered.has(name));

    expect(missing).toEqual([]);
  });

  it('gives every registered table a tenant_id column', () => {
    for (const table of TENANT_SCOPED_TABLES) {
      expect(
        (table as TenantScopedTable).tenantId,
        `${getTableName(table)} is missing tenant_id`
      ).toBeDefined();
    }
  });

  it('refuses a table with no tenant_id column', async () => {
    const tdb = tenantDb(1);
    await expect(
      tdb.findMany(tenants as unknown as TenantScopedTable)
    ).rejects.toThrow(TenantScopeViolationError);
  });

  it('refuses an invalid tenant id', () => {
    expect(() => tenantDb(0)).toThrow(TenantScopeViolationError);
    expect(() => tenantDb(-1)).toThrow(TenantScopeViolationError);
    expect(() => tenantDb(Number.NaN)).toThrow(TenantScopeViolationError);
    expect(() => tenantDb(1.5)).toThrow(TenantScopeViolationError);
  });
});

describe('tenantDb — isolation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('only reads its own rows', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');

    await alpha.insert(projects, { name: 'Alpha project' });
    await beta.insert(projects, { name: 'Beta project' });

    const alphaRows = await alpha.findMany(projects);
    const betaRows = await beta.findMany(projects);

    expect(alphaRows.map((p) => p.name)).toEqual(['Alpha project']);
    expect(betaRows.map((p) => p.name)).toEqual(['Beta project']);
  });

  it('does not leak a row through findById', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');

    const [alphaProject] = await alpha.insert(projects, { name: 'Secret' });

    expect(await alpha.findById(projects, alphaProject.id)).not.toBeNull();
    expect(await beta.findById(projects, alphaProject.id)).toBeNull();
  });

  it('does not leak a row through an explicit where clause', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');

    const [alphaProject] = await alpha.insert(projects, { name: 'Secret' });

    const leaked = await beta.findMany(
      projects,
      eq(projects.id, alphaProject.id)
    );
    expect(leaked).toEqual([]);
  });

  it('counts only its own rows', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');

    await alpha.insert(projects, [{ name: 'One' }, { name: 'Two' }]);
    await beta.insert(projects, { name: 'Three' });

    expect(await alpha.count(projects)).toBe(2);
    expect(await beta.count(projects)).toBe(1);
  });

  it('stamps tenant_id on insert without being asked', async () => {
    const alpha = await createTenant('Alpha');
    const [project] = await alpha.insert(projects, { name: 'Auto-scoped' });
    expect(project.tenantId).toBe(alpha.tenantId);
  });

  it('refuses to insert a row into another tenant', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');

    await expect(
      alpha.insert(projects, {
        name: 'Smuggled',
        tenantId: beta.tenantId,
      })
    ).rejects.toThrow(TenantScopeViolationError);

    expect(await beta.count(projects)).toBe(0);
  });

  it('refuses to move a row to another tenant on update', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const [project] = await alpha.insert(projects, { name: 'Mine' });

    await expect(
      alpha.update(
        projects,
        { tenantId: beta.tenantId },
        eq(projects.id, project.id)
      )
    ).rejects.toThrow(TenantScopeViolationError);
  });

  it('updates nothing across a tenant boundary', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const [project] = await alpha.insert(projects, { name: 'Original' });

    const updated = await beta.update(
      projects,
      { name: 'Hijacked' },
      eq(projects.id, project.id)
    );

    expect(updated).toEqual([]);
    expect((await alpha.findById(projects, project.id))?.name).toBe('Original');
  });

  it('deletes nothing across a tenant boundary', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const [project] = await alpha.insert(projects, { name: 'Keep me' });

    const deleted = await beta.delete(projects, eq(projects.id, project.id));

    expect(deleted).toEqual([]);
    expect(await alpha.count(projects)).toBe(1);
  });

  it('scopes a bare delete to the caller, never the whole table', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    await alpha.insert(projects, { name: 'Alpha only' });
    await beta.insert(projects, { name: 'Beta only' });

    await alpha.delete(projects);

    expect(await alpha.count(projects)).toBe(0);
    expect(await beta.count(projects)).toBe(1);
  });

  it('scopes deep-nested rows the same way', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');

    const { video } = await createProjectWithVideo(alpha);
    await alpha.insert(shots, {
      videoId: video.id,
      order: 1,
      type: 'image',
      prompt: 'A shot',
      durationS: 5,
    });

    expect(await alpha.count(shots)).toBe(1);
    expect(await beta.count(shots)).toBe(0);
    expect(await beta.findMany(videos, eq(videos.id, video.id))).toEqual([]);
  });

  it('keeps the scope inside a transaction', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    await beta.insert(projects, { name: 'Beta project' });

    const seen = await alpha.transaction(async (tx) => {
      expect(tx.tenantId).toBe(alpha.tenantId);
      await tx.insert(projects, { name: 'In transaction' });
      return await tx.findMany(projects);
    });

    expect(seen.map((p) => p.name)).toEqual(['In transaction']);
    expect(await beta.count(projects)).toBe(1);
  });

  it('rolls a transaction back as a unit', async () => {
    const alpha = await createTenant('Alpha');

    await expect(
      alpha.transaction(async (tx) => {
        await tx.insert(projects, { name: 'Doomed' });
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(await alpha.count(projects)).toBe(0);
  });

  it('scopes users, so a member list cannot span tenants', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');

    await alpha.insert(users, {
      email: 'a@alpha.test',
      passwordHash: 'x',
      role: 'owner',
    });
    await beta.insert(users, {
      email: 'b@beta.test',
      passwordHash: 'x',
      role: 'owner',
    });

    const alphaUsers = await alpha.findMany(users);
    expect(alphaUsers.map((u) => u.email)).toEqual(['a@alpha.test']);
  });

  it('reads and updates only its own tenant row', async () => {
    const alpha = await createTenant('Alpha', { credits: 10 });
    const beta = await createTenant('Beta', { credits: 20 });

    expect((await alpha.getTenant())?.creditsBalance).toBe(10);

    await alpha.updateTenant({ name: 'Alpha renamed' });

    expect((await alpha.getTenant())?.name).toBe('Alpha renamed');
    expect((await beta.getTenant())?.name).toBe('Beta');
  });
});
