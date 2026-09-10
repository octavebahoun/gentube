import type { NextRequest } from 'next/server';
import { tenantDb } from '@/lib/db/tenant-db';
import { getUser } from '@/lib/db/queries';
import {
  assertCanManageBilling,
  billingErrorResponse,
  revertCancellation,
} from '@/lib/billing';

/**
 * Annule la programmation d'annulation (réactive le renouvellement).
 *
 * Un client qui change d'avis avant la fin du cycle peut retirer son annulation.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  try {
    assertCanManageBilling(user);
    const subscription = await revertCancellation(tenantDb(user.tenantId));
    return Response.json(
      {
        ok: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          cancelAt: subscription.cancelAt?.toISOString(),
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const { status, message } = billingErrorResponse(error);
    return Response.json({ ok: false, message }, { status });
  }
}
