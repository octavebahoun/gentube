import type { NextRequest } from 'next/server';
import { processGeniusPayWebhook } from '@/lib/billing/webhook';
import { BillingNotConfiguredError } from '@/lib/billing/config';

/**
 * Callbacks de paiement GeniusPay → GenTube.
 *
 * Ce handler ne fait qu'adapter la requête : le corps brut est lu en texte
 * (c'est ce que couvre la signature — le parser puis re-sérialiser casserait
 * la vérification), les en-têtes sont passés en minuscules, et tout le reste
 * se passe dans lib/billing/webhook.ts, là où pointent les tests.
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
      // Ne jamais répondre 200 en silence à un paiement que l'instance ne
      // peut pas vérifier : la passerelle doit continuer de réessayer jusqu'à
      // ce que le secret soit en place.
      console.error('GeniusPay webhook rejected:', error.message);
      return Response.json(
        { ok: false, message: 'Billing is not configured.' },
        { status: 503 }
      );
    }

    // Aucun détail sur le fil, et pas de 200 non plus — c'est une
    // redelivery qu'on veut.
    console.error('GeniusPay webhook failed:', error);
    return Response.json(
      { ok: false, message: 'Webhook processing failed.' },
      { status: 500 }
    );
  }
}
