/**
 * Client HTTP pour appeler les routes `/api/internal` depuis les outils agent.
 * Jamais d'import direct de `lib/internal/handlers` — passe par HTTP.
 */

type InternalCallOptions = {
  endpoint: string;
  tenantId: number;
  videoId: number;
  baseUrl?: string;
};

type InternalResponse = {
  ok: boolean;
  [key: string]: unknown;
};

export class InternalApiError extends Error {
  readonly statusCode: number;
  readonly response: InternalResponse;

  constructor(message: string, statusCode: number, response: InternalResponse) {
    super(message);
    this.name = 'InternalApiError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Appelle une route `/api/internal/<endpoint>` avec auth et payload standard.
 */
export async function callInternal(
  options: InternalCallOptions
): Promise<InternalResponse> {
  const token = process.env.INTERNAL_API_TOKEN?.trim();
  if (!token) {
    throw new InternalApiError(
      'INTERNAL_API_TOKEN not configured',
      503,
      { ok: false, message: 'INTERNAL_API_TOKEN not configured' }
    );
  }

  const base = options.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const url = `${base}/api/internal/${options.endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tenantId: options.tenantId,
      videoId: options.videoId,
    }),
  });

  const data = (await response.json()) as InternalResponse;

  if (!response.ok || !data.ok) {
    throw new InternalApiError(
      (data as { message?: string }).message ?? 'Internal API call failed',
      response.status,
      data
    );
  }

  return data;
}
