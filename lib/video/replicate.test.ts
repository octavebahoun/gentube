import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AnimationRequest } from './contract';
import { ReplicateAnimator, type ReplicateConfig } from './replicate';

const CONFIG: ReplicateConfig = {
  token: 'r8_test',
  baseUrl: 'https://api.replicate.com/v1',
};

const PLAN: AnimationRequest = {
  imageUrl: 'https://cdn.example.com/plan-1.png',
  prompt: 'un lent travelling avant',
  durationS: 6,
  quality: 'draft',
  ratio: '16:9',
  webhookUrl: 'https://gentube.example.com/api/webhooks/replicate?job=1',
};

/** Une réponse `fetch` minimale, avec l'en-tête `Retry-After` que le throttle
 * de Replicate renvoie. */
function reponse(body: unknown, status = 200, retryAfter?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'retry-after' ? (retryAfter ?? null) : null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let fetchOrigine: typeof globalThis.fetch;

beforeEach(() => {
  fetchOrigine = globalThis.fetch;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = fetchOrigine;
});

describe('la reprise sur 429', () => {
  it('attend le Retry-After annoncé puis rejoue, et la soumission aboutit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reponse({ detail: 'throttled' }, 429, '1'))
      .mockResolvedValueOnce(reponse({ id: 'pred_1', status: 'starting' }, 200));
    globalThis.fetch = fetchMock;

    const promesse = new ReplicateAnimator(CONFIG).submit(PLAN);
    await vi.runAllTimersAsync();
    const rendu = await promesse;

    // Un 429 rejette la requête avant de rien créer : la rejouer ne double
    // aucune prédiction, et on récupère l'identifiant au second essai.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rendu.externalId).toBe('pred_1');
  });

  it('abandonne proprement en 429 quand le throttle ne se résorbe pas', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reponse({ detail: 'throttled' }, 429, '1'));
    globalThis.fetch = fetchMock;

    const promesse = new ReplicateAnimator(CONFIG).submit(PLAN);
    const attendu = expect(promesse).rejects.toMatchObject({ statusCode: 429 });
    await vi.runAllTimersAsync();
    await attendu;

    // La première tentative, plus les reprises bornées.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
