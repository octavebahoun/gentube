import type { NextRequest } from 'next/server';
import { tenantDb } from '@/lib/db/tenant-db';
import { getUser } from '@/lib/db/queries';
import {
  assertCanManageBilling,
  createSubscriptionCheckout,
} from '@/lib/billing/checkout';
import { billingErrorResponse } from '@/lib/billing/errors';

/** Ouvre un checkout pour un plan mensuel. Renvoie l'URL vers laquelle rediriger. */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  let plan: unknown;
  try {
    plan = (await request.json())?.plan;
  } catch {
    return Response.json({ message: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    assertCanManageBilling(user);
    const checkout = await createSubscriptionCheckout(
      tenantDb(user.tenantId),
      plan
    );
    return Response.json(checkout, { status: 201 });
  } catch (error) {
    const { status, message } = billingErrorResponse(error);
    return Response.json({ message }, { status });
  }
}
