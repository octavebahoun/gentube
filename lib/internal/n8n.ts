import { internalApiToken } from './auth';

/**
 * Réveille le workflow n8n après une validation.
 *
 * n8n n'écrit jamais dans Postgres : il enchaîne nos routes internes.
 * Next l'appelle ici, une fois les crédits débités. Si l'URL n'est pas
 * posée, on ne fait pas échouer la validation — le client a payé, Cosme
 * doit poser `N8N_BASE_URL`.
 *
 * Sens inverse du Bearer interne : ici on authentifie Next → n8n avec
 * `N8N_WEBHOOK_SECRET` (repli sur `INTERNAL_API_TOKEN` tant que les deux
 * portent la même valeur).
 */

export const PRODUCTION_WEBHOOK_PATH = '/webhook/gentube-production';

export type WorkflowStart = {
  started: boolean;
  reason?: string;
};

export async function startProductionWorkflow(
  tenantId: number,
  videoId: number
): Promise<WorkflowStart> {
  const base = process.env.N8N_BASE_URL?.trim();
  if (!base) {
    console.warn(
      `[n8n] N8N_BASE_URL is empty: video ${videoId} was validated but production was not started.`
    );
    return { started: false, reason: 'N8N_BASE_URL is not set.' };
  }

  const secret = process.env.N8N_WEBHOOK_SECRET?.trim() || internalApiToken();
  const url = `${base.replace(/\/+$/, '')}${PRODUCTION_WEBHOOK_PATH}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ tenantId, videoId }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`n8n webhook responded ${response.status}.`);
  }

  return { started: true };
}
