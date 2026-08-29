import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { createTopUpCheckout } from '@/lib/billing/billing.service';
import { billingErrorResponse, requireBillingAdmin } from '@/lib/billing/guard';

const bodySchema = z.object({ packIndex: z.number().int().min(0) });

export async function POST(request: NextRequest) {
  try {
    const { tdb } = await requireBillingAdmin();

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Pack invalide.' },
        { status: 400 }
      );
    }

    const { checkoutUrl, intent } = await createTopUpCheckout(
      tdb,
      parsed.data.packIndex,
      {
        initiatedFromIp:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      }
    );

    return Response.json({ success: true, checkoutUrl, intentId: intent.id });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
