import { cancelSubscription } from '@/lib/billing/billing.service';
import { billingErrorResponse, requireBillingAdmin } from '@/lib/billing/guard';

export async function POST() {
  try {
    const { tdb } = await requireBillingAdmin();
    const subscription = await cancelSubscription(tdb);
    return Response.json({
      success: true,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      effectiveAt: subscription.currentPeriodEnd,
    });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
