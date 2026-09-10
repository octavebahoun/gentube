import type { TenantDb } from '@/lib/db/tenant-db';
import { activityLogs, type ActivityType } from '@/lib/db/schema';

/**
 * Enregistre une activité dans le journal du tenant.
 *
 * Centralise la journalisation de toutes les actions importantes : connexion,
 * gestion de compte, création de vidéo, débits de crédits, rendu.
 */
export async function logActivity(
  tdb: TenantDb | number,
  userId: number,
  type: ActivityType,
  ipAddress?: string
): Promise<void> {
  const tenantId = typeof tdb === 'number' ? tdb : tdb.tenantId;
  
  if (tenantId === null || tenantId === undefined) {
    return;
  }

  const db = typeof tdb === 'number' 
    ? (await import('@/lib/db/tenant-db')).tenantDb(tenantId)
    : tdb;

  await db.insert(activityLogs, {
    userId,
    action: type,
    ipAddress: ipAddress || '',
  });
}
