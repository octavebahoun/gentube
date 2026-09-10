import type { NextRequest } from 'next/server';
import { tenantDb } from '@/lib/db/tenant-db';
import { getUser } from '@/lib/db/queries';
import {
  assertCanManageBilling,
  billingErrorResponse,
  scheduleCancellation,
} from '@/lib/billing';

/**
 * Programme l'annulation d'un abonnement à la fin du cycle en cours.
 *
 * **Contrat cancel_at** : l'abonnement reste actif jusqu'à `currentPeriodEnd`,
 * puis bascule en `canceled` sans créer de nouveau cycle.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  try {
    assertCanManageBilling(user);
    const subscription = await scheduleCancellation(tenantDb(user.tenantId));
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
