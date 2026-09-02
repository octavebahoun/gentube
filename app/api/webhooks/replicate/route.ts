import type { NextRequest } from 'next/server';
import { processReplicateWebhook } from '@/lib/video/webhook';
import { AnimationNotConfiguredError } from '@/lib/video/contract';

/**
 * Callbacks de génération Replicate → GenTube.
 *
 * Ce handler ne fait qu'adapter la requête : le corps est lu en texte brut —
 * c'est lui que la signature couvre, le parser puis re-sérialiser casserait la
 * vérification — et tout le reste vit dans lib/video/webhook.ts, là où
 * pointent les tests.
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

    const result = await processReplicateWebhook(headers, rawBody, {
      jobId: Number.isInteger(job) && job > 0 ? job : null,
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof AnimationNotConfiguredError) {
      // Pas de 200 en silence sur un clip que l'instance ne sait pas
      // vérifier : Replicate doit continuer de réessayer jusqu'à ce que le
      // secret soit posé.
      console.error('Replicate webhook rejected:', error.message);
      return Response.json(
        { ok: false, message: 'Video generation is not configured.' },
        { status: 503 }
      );
    }

    // Aucun détail sur le fil, et pas de 200 non plus — c'est une redelivery
    // qu'on veut.
    console.error('Replicate webhook failed:', error);
    return Response.json(
      { ok: false, message: 'Webhook processing failed.' },
      { status: 500 }
    );
  }
}
