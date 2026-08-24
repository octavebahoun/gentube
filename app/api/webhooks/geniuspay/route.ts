import type { NextRequest } from 'next/server';
import { processGeniusPayWebhook } from '@/lib/billing/webhook';
import { BillingNotConfiguredError } from '@/lib/billing/config';

/**
 * GeniusPay → GenTube payment callbacks.
 *
 * This handler only adapts the request: the raw body is read as text (it is
 * what the signature covers — parsing it first and re-serialising would break
 * verification), headers are lowercased, and everything else happens in
 * lib/billing/webhook.ts, which is where the tests point.
 */
export async function POST(request: NextRequest) {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json(
      { ok: false, message: 'Could not read request body.' },
      { status: 400 }
    );
  }

  try {
    const result = await processGeniusPayWebhook(headers, rawBody, {
      ip: request.headers.get('x-forwarded-for'),
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      // Never silently 200 a payment the instance cannot verify: the gateway
      // must keep retrying until the secret is in place.
      console.error('GeniusPay webhook rejected:', error.message);
      return Response.json(
        { ok: false, message: 'Billing is not configured.' },
        { status: 503 }
      );
    }

    // No detail on the wire, and no 200 either — a redelivery is what we want.
    console.error('GeniusPay webhook failed:', error);
    return Response.json(
      { ok: false, message: 'Webhook processing failed.' },
      { status: 500 }
    );
  }
}
