import type { NextRequest } from 'next/server';
import type { InternalHeaders, InternalResult } from './handlers';

/** Voix et images tiennent la requête jusqu'à la fin de l'étape. */
export const INTERNAL_ROUTE_MAX_DURATION = 300;

type Handler = (
  headers: InternalHeaders,
  rawBody: string
) => Promise<InternalResult>;

/**
 * Adaptateur HTTP : lire le corps brut, appeler le handler, rendre JSON.
 * Les routes ne font que ça — la logique vit dans `lib/internal`.
 */
export async function postInternal(
  request: NextRequest,
  handler: Handler
): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json(
      { ok: false, message: 'Could not read request body.' },
      { status: 400 }
    );
  }

  const result = await handler(request.headers, rawBody);
  return Response.json(result.body, { status: result.status });
}
