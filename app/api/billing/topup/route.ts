import type { NextRequest } from 'next/server';
import { tenantDb } from '@/lib/db/tenant-db';
import { getUser } from '@/lib/db/queries';
import {
  assertCanManageBilling,
  createTopupCheckout,
} from '@/lib/billing/checkout';
import { billingErrorResponse } from '@/lib/billing/errors';

/** Starts a checkout for a one-off credit pack. */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  let packId: unknown;
  try {
    packId = (await request.json())?.packId;
  } catch {
    return Response.json({ message: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    assertCanManageBilling(user);
    const checkout = await createTopupCheckout(
      tenantDb(user.tenantId),
      packId
    );
    return Response.json(checkout, { status: 201 });
  } catch (error) {
    const { status, message } = billingErrorResponse(error);
    return Response.json({ message }, { status });
  }
}
