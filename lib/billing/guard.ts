import 'server-only';
import { getUser } from '@/lib/db/queries';
import { tenantDb, type TenantDb } from '@/lib/db/tenant-db';
import type { User } from '@/lib/db/schema';
import { BillingError } from './billing.service';

/**
 * Only an owner or an admin may change what the workspace is billed. Members
 * can read the billing page but not spend money on it.
 */
export async function requireBillingAdmin(): Promise<{
  tdb: TenantDb;
  user: User;
}> {
  const user = await getUser();
  if (!user) throw new BillingError('Non authentifié.', 401);
  if (user.role === 'member') {
    throw new BillingError(
      'Seul un propriétaire ou un administrateur peut gérer la facturation.',
      403
    );
  }
  return { tdb: tenantDb(user.tenantId), user };
}

export function billingErrorResponse(error: unknown) {
  if (error instanceof BillingError) {
    return Response.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  console.error('[billing] unexpected error:', error);
  return Response.json(
    { success: false, error: 'Erreur interne.' },
    { status: 500 }
  );
}
