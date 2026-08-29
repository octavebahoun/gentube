import { resumeSubscription } from '@/lib/billing/billing.service';
import { billingErrorResponse, requireBillingAdmin } from '@/lib/billing/guard';

export async function POST() {
  try {
    const { tdb } = await requireBillingAdmin();
    const subscription = await resumeSubscription(tdb);
    return Response.json({
      success: true,
      plan: subscription.plan,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
