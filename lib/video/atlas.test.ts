import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimationError, type AnimationRequest } from './contract';
import { ATLAS_MAX_SECONDS, AtlasAnimator, atlasDuration, lire } from './atlas';

const CONFIG = {
  apiKey: 'atl_test',
  baseUrl: 'https://api.atlascloud.ai/api/v1',
  model: 'atlascloud/wan-2.2/image-to-video',
};

const PLAN: AnimationRequest = {
  imageUrl: 'https://cdn.example.com/plan-1.png',
  prompt: 'un lent travelling avant',
  durationS: 6.2,
  resolution: '480p',
  ratio: '16:9',
  webhookUrl: 'https://gentube.example.com/api/webhooks/atlas',
};

/** Ce qu'Atlas a rendu, avec l'enveloppe `data` que sa doc décrit. */
function repond(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

let fetchOrigine: typeof globalThis.fetch;

beforeEach(() => {
  fetchOrigine = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOrigine;
});

describe('la soumission', () => {
  it('poste le corps que la doc décrit, rappel compris', async () => {
    /*
     * Le seul champ qui décide de tout : `webhook_url`. Sans lui Atlas ne
     * rappelle pas, et un fournisseur qu on croit branché en webhook laisse ses
     * jobs `running` pour toujours.
     */
    const appel = repond({ data: { id: 'pred_42', status: 'processing' } });
    globalThis.fetch = appel;

    const rendu = await new AtlasAnimator(CONFIG).submit(PLAN);

    const [url, init] = appel.mock.calls[0];
    expect(url).toBe('https://api.atlascloud.ai/api/v1/model/generateVideo');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer atl_test');

    expect(JSON.parse(init.body)).toEqual({
      model: 'atlascloud/wan-2.2/image-to-video',
      image: PLAN.imageUrl,
      prompt: PLAN.prompt,
      resolution: '480p',
      duration: 7,
      webhook_url: PLAN.webhookUrl,
    });

    expect(rendu.externalId).toBe('pred_42');
    expect(rendu.model).toBe(CONFIG.model);
  });

  it('lit l identifiant sous data, pas à la racine', async () => {
    // L enveloppe est `{ data: { id } }` : lire `id` à la racine rendrait
    // undefined à chaque appel, et le job n aurait plus rien pour se retrouver.
    globalThis.fetch = repond({ id: 'a-la-racine', data: {} });

    await expect(new AtlasAnimator(CONFIG).submit(PLAN)).rejects.toThrow(
      /no prediction id/
    );
  });

  it('refuse un plan plus long que ce qu Atlas rend', async () => {
    const appel = repond({ data: { id: 'x' } });
    globalThis.fetch = appel;

    await expect(
      new AtlasAnimator(CONFIG).submit({ ...PLAN, durationS: 12 })
    ).rejects.toThrow(/cannot exceed/);
    // Rien n a été soumis : un plan refusé ne doit pas être facturé.
    expect(appel).not.toHaveBeenCalled();
  });

  it('distingue le solde épuisé et la limite de débit d une panne', async () => {
    // Deux pannes d exploitation : il faut recharger ou attendre, pas chercher
    // un bug dans le plan.
    globalThis.fetch = repond({ code: 402, msg: 'insufficient balance' }, 402);
    await expect(new AtlasAnimator(CONFIG).submit(PLAN)).rejects.toMatchObject({
      statusCode: 402,
    });

    globalThis.fetch = repond({ code: 429, msg: 'rate limited' }, 429);
    await expect(new AtlasAnimator(CONFIG).submit(PLAN)).rejects.toMatchObject({
      statusCode: 429,
    });
  });
});

describe('la durée', () => {
  it('arrondit vers le haut, jamais vers le bas', () => {
    // Arrondir 6,2 s à 6 laisserait deux dixièmes de voix off sur une image
    // arrêtée. Ça se voit.
    expect(atlasDuration(6.2)).toBe(7);
    expect(atlasDuration(5)).toBe(5);
  });

  it('tient le plancher d Atlas', () => {
    // Atlas ne descend pas sous 3 s : demander 2 ferait un 400 chez lui.
    expect(atlasDuration(2)).toBe(3);
    expect(atlasDuration(0.5)).toBe(3);
  });

  it('ne dépasse pas le plafond', () => {
    expect(atlasDuration(ATLAS_MAX_SECONDS)).toBe(ATLAS_MAX_SECONDS);
  });
});

describe('la lecture d un état', () => {
  it('rend le clip quand la tâche est terminée', () => {
    expect(lire({ status: 'completed', outputs: ['https://cdn/clip.mp4'] })).toEqual(
      { status: 'succeeded', videoUrl: 'https://cdn/clip.mp4' }
    );
  });

  it('accepte une sortie qui porte son url dans un objet', () => {
    // La doc montre les deux formes selon la page : `["https://..."]` côté
    // webhook, `[{}]` côté modèle. On lit les deux plutôt que de parier.
    expect(lire({ status: 'completed', outputs: [{ url: 'https://cdn/c.mp4' }] })).toEqual(
      { status: 'succeeded', videoUrl: 'https://cdn/c.mp4' }
    );
  });

  it('compte un dépassement de délai comme un échec', () => {
    // La tâche ne reviendra pas : la laisser en attente immobiliserait les
    // crédits pour toujours.
    expect(lire({ status: 'timeout' })).toEqual({
      status: 'failed',
      error: 'Prediction timeout.',
    });
  });

  it('garde en attente un état qu on ne connaît pas', () => {
    // Un nom d état ajouté par le fournisseur ne doit pas faire perdre un clip
    // déjà payé.
    expect(lire({ status: 'queued' })).toEqual({ status: 'pending' });
    expect(lire(undefined)).toEqual({ status: 'pending' });
  });

  it('refuse une réussite sans url', () => {
    expect(() => lire({ status: 'completed', outputs: [] })).toThrow(AnimationError);
  });
});

describe('le filet', () => {
  it('rend en attente quand Atlas est injoignable', async () => {
    // Ne pas savoir n est pas savoir que c est raté : le GPU travaille
    // toujours, et marquer `failed` ferait repayer un clip qui va arriver.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

    expect(await new AtlasAnimator(CONFIG).outcome('pred_42')).toEqual({
      status: 'pending',
    });
  });

  it('ne fait pas passer une prédiction inconnue pour une tâche en cours', async () => {
    // Un 404 ramené à « en cours » laisserait le job tourner pour toujours sur
    // un identifiant qui n existe pas.
    globalThis.fetch = repond({ code: 404, msg: 'not found' }, 404);

    await expect(new AtlasAnimator(CONFIG).outcome('inconnu')).rejects.toThrow(
      /Atlas 404/
    );
  });

  it('rend en attente quand Atlas est en panne passagère', async () => {
    globalThis.fetch = repond({ code: 503, msg: 'unavailable' }, 503);

    expect(await new AtlasAnimator(CONFIG).outcome('pred_42')).toEqual({
      status: 'pending',
    });
  });

  it('interroge la prédiction par son identifiant', async () => {
    const appel = repond({ data: { status: 'processing' } });
    globalThis.fetch = appel;

    await new AtlasAnimator(CONFIG).outcome('pred_42');

    expect(appel.mock.calls[0][0]).toBe(
      'https://api.atlascloud.ai/api/v1/model/prediction/pred_42'
    );
  });
});
