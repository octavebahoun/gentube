import type { NextRequest } from 'next/server';
import { processPaymentWebhook } from '@/lib/billing/webhook';
import { PaymentNotConfiguredError } from '@/lib/payments';

/**
 * Rappels de paiement SasPay → GenTube.
 *
 * Ce handler ne fait qu'adapter la requête. Le corps est lu en texte brut —
 * c'est lui que la signature HMAC couvre, le parser puis le re-sérialiser
 * casserait la vérification — et tout le reste vit dans `lib/billing/webhook.ts`,
 * là où pointent les tests.
 *
 * Pas de paramètre d'URL ici, contrairement aux rappels de rendu : SasPay
 * déclare son URL dans son propre tableau de bord, une fois pour toutes. C'est
 * précisément pourquoi son rappel ne peut désigner aucun encaissement, et
 * pourquoi il ne sert que de réveil.
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
    const result = await processPaymentWebhook(headers, rawBody, {
      ip: request.headers.get('x-forwarded-for'),
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof PaymentNotConfiguredError) {
      // Pas de 200 en silence sur un paiement que l'instance ne sait pas
      // vérifier : SasPay doit continuer de réessayer jusqu'à ce que les clés
      // soient posées.
      console.error('SasPay webhook rejected:', error.message);
      return Response.json(
        { ok: false, message: 'Payments are not configured.' },
        { status: 503 }
      );
    }

    // Aucun détail sur le fil, et pas de 200 non plus — c'est une redelivery
    // qu'on veut.
    console.error('SasPay webhook failed:', error);
    return Response.json(
      { ok: false, message: 'Webhook processing failed.' },
      { status: 500 }
    );
  }
}
