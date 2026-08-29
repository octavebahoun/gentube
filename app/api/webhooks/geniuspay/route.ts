import { NextResponse, type NextRequest } from 'next/server';
import { processGeniusPayWebhook } from '@/lib/payments/geniuspay/webhook';

/**
 * The raw body must reach the pipeline byte for byte — the HMAC is computed
 * over exactly what was sent, so parsing and re-serialising here would break
 * every signature.
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
    return NextResponse.json(
      { success: false, error: 'Could not read request body' },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  try {
    const result = await processGeniusPayWebhook(headers, rawBody, ip);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // The event row already carries the reason; the gateway gets a 500 so it
    // retries, and the retry resumes on the same unprocessed row.
    console.error('[geniuspay] webhook processing failed:', error);
    return NextResponse.json(
      { success: false, error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
