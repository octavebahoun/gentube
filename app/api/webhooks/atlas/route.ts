import type { NextRequest } from 'next/server';
import { processAtlasWebhook } from '@/lib/video/atlas-webhook';
import { AnimationError, AnimationNotConfiguredError } from '@/lib/video/contract';

/**
 * Callbacks de génération Atlas Cloud → GenTube.
 *
 * Le pendant de `app/api/webhooks/replicate` et écrit sur le même modèle : ce
 * handler ne fait qu'adapter la requête. Le corps est lu en texte brut — c'est
 * lui que la signature Ed25519 couvre, le parser puis re-sérialiser casserait
 * la vérification — et tout le reste vit dans `lib/video/atlas-webhook.ts`, là
 * où pointent les tests.
 *
 * Deux routes et non une : Atlas signe en Ed25519 sur `<timestamp>.<corps>`,
 * Replicate en HMAC sur `<id>.<timestamp>.<corps>`. Une route ne peut pas
 * deviner laquelle elle reçoit, et les essayer toutes les deux laisserait
 * choisir la plus faible à celui qui frappe.
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
    // `?job=<id>` est posé sur l'URL de rappel à la soumission : il permet de
    // résoudre le job même si le rappel double l'écriture de l'identifiant de
    // prédiction. La valeur est vérifiée contre le corps signé, pas crue.
    const job = Number(request.nextUrl.searchParams.get('job'));

    const result = await processAtlasWebhook(headers, rawBody, {
      jobId: Number.isInteger(job) && job > 0 ? job : null,
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof AnimationNotConfiguredError) {
      // Pas de 200 en silence sur un clip que l'instance ne sait pas vérifier :
      // Atlas doit continuer de réessayer jusqu'à ce que la clé soit posée.
      console.error('Atlas webhook rejected:', error.message);
      return Response.json(
        { ok: false, message: 'Video generation is not configured.' },
        { status: 503 }
      );
    }

    if (error instanceof AnimationError) {
      // Typiquement le JWKS injoignable : sans clé publique on ne peut ni
      // vérifier ni refuser franchement. 503, et Atlas redélivrera.
      console.error('Atlas webhook could not verify:', error.message);
      return Response.json(
        { ok: false, message: 'Could not verify the callback.' },
        { status: 503 }
      );
    }

    // Aucun détail sur le fil, et pas de 200 non plus — c'est une redelivery
    // qu'on veut.
    console.error('Atlas webhook failed:', error);
    return Response.json(
      { ok: false, message: 'Webhook processing failed.' },
      { status: 500 }
    );
  }
}
