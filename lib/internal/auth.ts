import { safeEqual } from '@/lib/crypto/encryption';

/**
 * Authentification des routes `/api/internal`.
 *
 * n8n (et plus tard l'agent) appelle ces routes avec
 * `Authorization: Bearer <INTERNAL_API_TOKEN>`. Pas de session, pas de cookie,
 * pas de CORS : ce n'est pas un navigateur.
 *
 * Le contrat nomme `INTERNAL_API_TOKEN`. Le `.env` a longtemps porté
 * `N8N_WEBHOOK_SECRET` pour les deux sens. On lit le nom du contrat d'abord ;
 * le secret n8n reste un repli tant que Cosme n'a pas posé les deux.
 */

export class InternalAuthError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'InternalAuthError';
    this.statusCode = statusCode;
  }
}

/** Jeton attendu sur `Authorization: Bearer`. */
export function internalApiToken(): string | null {
  const primary = process.env.INTERNAL_API_TOKEN?.trim();
  if (primary) return primary;
  const fallback = process.env.N8N_WEBHOOK_SECRET?.trim();
  return fallback || null;
}

function headerValue(
  headers: Headers | Record<string, string | null | undefined>,
  name: string
): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const rec = headers as Record<string, string | null | undefined>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? (rec[key] ?? undefined) : undefined;
}

/**
 * Refuse tout appel sans jeton valide.
 *
 * 503 si l'instance n'est pas configurée — l'appelant réessaiera, comme pour
 * les webhooks Replicate et SasPay. 401 si le Bearer ne correspond pas,
 * sans dire si c'est l'absence ou la valeur.
 */
export function assertInternalAuth(
  headers: Headers | Record<string, string | null | undefined>
): void {
  const expected = internalApiToken();
  if (!expected) {
    throw new InternalAuthError(
      'Internal API is not configured: INTERNAL_API_TOKEN is missing.',
      503
    );
  }

  const authorization = headerValue(headers, 'authorization') ?? '';
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim());
  const presented = match?.[1] ?? '';

  if (!presented || !safeEqual(presented, expected)) {
    throw new InternalAuthError('Unauthorized.', 401);
  }
}
