import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { retrySubscriptionPayment } from '@/lib/billing/billing.service';
import { billingErrorResponse, requireBillingAdmin } from '@/lib/billing/guard';

const bodySchema = z.object({ billingCycleId: z.number().int().positive() });

export async function POST(request: NextRequest) {
  try {
    const { tdb } = await requireBillingAdmin();

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Cycle invalide.' },
        { status: 400 }
      );
    }

    const { checkoutUrl } = await retrySubscriptionPayment(
      tdb,
      parsed.data.billingCycleId,
      {
        initiatedFromIp:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      }
    );

    return Response.json({ success: true, checkoutUrl });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
