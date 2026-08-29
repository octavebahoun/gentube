import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { createSubscriptionCheckout } from '@/lib/billing/billing.service';
import { PURCHASABLE_PLANS } from '@/lib/billing/plans';
import { billingErrorResponse, requireBillingAdmin } from '@/lib/billing/guard';

const bodySchema = z.object({ plan: z.enum(PURCHASABLE_PLANS) });

export async function POST(request: NextRequest) {
  try {
    const { tdb } = await requireBillingAdmin();

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Plan invalide.' },
        { status: 400 }
      );
    }

    const { checkoutUrl, intent, cycle } = await createSubscriptionCheckout(
      tdb,
      parsed.data.plan,
      {
        initiatedFromIp:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      }
    );

    return Response.json({
      success: true,
      checkoutUrl,
      intentId: intent.id,
      invoiceNumber: cycle.invoiceNumber,
    });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
