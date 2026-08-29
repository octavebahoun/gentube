import { getBillingOverview } from '@/lib/billing/billing.service';
import { billingErrorResponse } from '@/lib/billing/guard';
import { requireTenantDb } from '@/lib/db/queries';

/** Read-only: any member of the workspace may see what it is paying. */
export async function GET() {
  try {
    const tdb = await requireTenantDb();
    return Response.json(await getBillingOverview(tdb));
  } catch (error) {
    return billingErrorResponse(error);
  }
}
