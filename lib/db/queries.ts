import { and, desc, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from './drizzle';
import { tenantDb, type TenantDb } from './tenant-db';
import { activityLogs, users, type TenantDataWithMembers } from './schema';
import { verifyToken } from '@/lib/auth/session';

/**
 * Session -> utilisateur. C'est le seul endroit qui lit une table sans filtre
 * tenant : c'est la requête qui *résout* à quel tenant l'appelant appartient,
 * et elle est clé sur l'id d'utilisateur porté par un cookie de session signé.
 * Tout ce qui suit passe par `tenantDb()`.
 */
export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  return user.length > 0 ? user[0] : null;
}

/**
 * Handle de base de données scopé au tenant pour l'utilisateur connecté.
 * Chaque server action, route handler et page devrait commencer ici.
 */
export async function getTenantDb(): Promise<TenantDb | null> {
  const user = await getUser();
  return user ? tenantDb(user.tenantId) : null;
}

/** Pareil, mais lève au lieu de renvoyer null — pour les chemins authentifiés uniquement. */
export async function requireTenantDb(): Promise<TenantDb> {
  const tdb = await getTenantDb();
  if (!tdb) throw new Error('Not authenticated');
  return tdb;
}

export async function getTenantForUser(): Promise<TenantDataWithMembers | null> {
  const user = await getUser();
  if (!user) return null;

  const tdb = tenantDb(user.tenantId);
  const tenant = await tdb.getTenant();
  if (!tenant) return null;

  const members = await tdb.findMany(users, isNull(users.deletedAt));

  return {
    ...tenant,
    users: members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
    })),
  };
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  const tdb = tenantDb(user.tenantId);
  const logs = await tdb.findMany(activityLogs, eq(activityLogs.userId, user.id), {
    orderBy: [desc(activityLogs.timestamp)],
    limit: 10,
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    timestamp: log.timestamp,
    ipAddress: log.ipAddress,
    userName: user.name,
  }));
}
