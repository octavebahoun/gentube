import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVIDER_COST_USD_PER_SECOND } from '@/lib/credits/pricing';
import {
  ImageError,
  ImageNotConfiguredError,
  WorkersAiImageClient,
  imageConfig,
  imageCostUsd,
  isImageConfigured,
} from './flux';

const MANAGED = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_AI_TOKEN',
  'CLOUDFLARE_IMAGE_MODEL',
  'CLOUDFLARE_AI_BASE_URL',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of MANAGED) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MANAGED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

function client() {
  return new WorkersAiImageClient({
    accountId: 'acct-1',
    token: 'cfat-test',
    model: '@cf/black-forest-labs/flux-2-klein-4b',
    baseUrl: 'https://ai.test/client/v4',
  });
}

function stubFetch(
  payload: unknown,
  { status = 200, raw }: { status?: number; raw?: string } = {}
) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(raw ?? JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ok = (bytes = 'jpeg-bytes') => ({
  success: true,
  result: { image: Buffer.from(bytes).toString('base64') },
  errors: [],
});

describe('imageConfig', () => {
  it('refuses to run without an account and a token', () => {
    expect(isImageConfigured()).toBe(false);
    expect(() => imageConfig()).toThrow(ImageNotConfiguredError);

    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
    // Nommer la variable qui manque : un 401 opaque plus tard coûte une heure.
    expect(() => imageConfig()).toThrow(/CLOUDFLARE_AI_TOKEN/);
  });

  it('defaults the model and the endpoint', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
    process.env.CLOUDFLARE_AI_TOKEN = 'cfat-abc';

    expect(imageConfig()).toEqual({
      accountId: 'acct-1',
      token: 'cfat-abc',
      model: '@cf/black-forest-labs/flux-2-klein-4b',
      baseUrl: 'https://api.cloudflare.com/client/v4',
    });
  });
});

describe('generating a still', () => {
  it('sends multipart form data, never JSON', async () => {
    // Un corps JSON reçoit « required properties at '/' are 'multipart' », ce
    // qui ne dit pas qu'il faut changer d'encodage. Le test fige l'encodage.
    const fetchMock = stubFetch(ok());

    await client().generate({
      prompt: '  a lone baobab at sunset  ',
      ratio: '16:9',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://ai.test/client/v4/accounts/acct-1/ai/run/@cf/black-forest-labs/flux-2-klein-4b'
    );
    expect(init?.body).toBeInstanceOf(FormData);

    const form = init?.body as FormData;
    expect(form.get('prompt')).toBe('a lone baobab at sunset');
    expect(form.get('width')).toBe('1920');
    expect(form.get('height')).toBe('1088');

    // Poser Content-Type nous-mêmes écraserait la frontière multipart que
    // fetch calcule, et le serveur ne lirait plus le corps.
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer cfat-test');
    expect(Object.keys(headers)).not.toContain('Content-Type');
  });

  it('demande la trame du modèle, pas celle qu on livre', async () => {
    /*
     * 1088 et non 1080 : Workers AI rabote au multiple de 16 inférieur, donc
     * demander 1080 rendrait 1072. La composition redescend ensuite à 1080.
     */
    const fetchMock = stubFetch(ok());

    const image = await client().generate({
      prompt: 'a market at dawn',
      ratio: '9:16',
    });

    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect([form.get('width'), form.get('height')]).toEqual(['1088', '1920']);
    expect(image.contentType).toBe('image/jpeg');
    expect(image.bytes.toString()).toBe('jpeg-bytes');
  });

  it('refuses an empty prompt instead of paying for noise', async () => {
    // Vérifié contre l'API réelle : un prompt vide n'est pas rejeté, le modèle
    // rend une image de bruit et la facture. Le garde-fou est donc ici.
    const fetchMock = stubFetch(ok());

    await expect(
      client().generate({ prompt: '   ', ratio: '16:9' })
    ).rejects.toThrow(ImageError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-integer seed before the provider says "Invalid input"', async () => {
    const fetchMock = stubFetch(ok());

    await expect(
      client().generate({
        prompt: 'a baobab',
        ratio: '16:9',
        seed: 1.5,
      })
    ).rejects.toThrow(/Seed must be a non-negative integer/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('omits the seed when none is asked for', async () => {
    const fetchMock = stubFetch(ok());

    await client().generate({ prompt: 'a baobab', ratio: '16:9' });

    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(form.has('seed')).toBe(false);
  });

  it('surfaces the provider message on an HTTP error', async () => {
    stubFetch(
      { success: false, errors: [{ message: 'AiError: max width is 2048', code: 3030 }] },
      { status: 400 }
    );

    await expect(
      client().generate({ prompt: 'a baobab', ratio: '16:9' })
    ).rejects.toThrow(/max width is 2048/);
  });

  it('maps a rate limit to 429 so a retry can back off', async () => {
    stubFetch({ success: false, errors: [{ message: 'too many requests' }] }, { status: 429 });

    await expect(
      client().generate({ prompt: 'a baobab', ratio: '16:9' })
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('treats a 200 carrying success:false as a failure', async () => {
    // Le HTTP décrit l'appel, pas l'inférence : Workers AI répond 200 avec
    // `success: false` quand le modèle refuse. Lire le seul statut HTTP
    // stockerait une image absente.
    stubFetch({ success: false, errors: [{ message: 'content filtered' }], result: {} });

    await expect(
      client().generate({ prompt: 'a baobab', ratio: '16:9' })
    ).rejects.toThrow(/content filtered/);
  });

  it('fails loudly when the answer carries no image', async () => {
    stubFetch({ success: true, result: {}, errors: [] });

    await expect(
      client().generate({ prompt: 'a baobab', ratio: '16:9' })
    ).rejects.toThrow(/no image/);
  });

  it('never echoes the request back in an error', async () => {
    stubFetch(undefined, { status: 500, raw: 'upstream exploded' });

    await expect(
      client().generate({ prompt: 'a baobab', ratio: '16:9' })
    ).rejects.toThrow(/upstream exploded/);
    // Le jeton vit dans l'en-tête ; renvoyer la requête le mettrait dans les logs.
    await expect(
      client().generate({ prompt: 'a baobab', ratio: '16:9' })
    ).rejects.not.toThrow(/cfat-test/);
  });
});

describe('ce que coûte une image', () => {
  it('facture à la surface, en tuiles de 512', () => {
    // Doubler chaque côté quadruple le nombre de tuiles, donc le prix.
    expect(imageCostUsd(1920, 1088) / imageCostUsd(960, 544)).toBeCloseTo(4, 6);
  });

  it('reste deux ordres de grandeur sous une seconde de vidéo', () => {
    /*
     * C'est le chiffre qui justifie qu'une image soit un forfait de 3 crédits
     * plutôt qu'un tarif à la seconde : une image entière en 1080p coûte
     * ~0,0035 $, une seconde de Full HD 0,01 $ et une de Cinéma 0,04 $.
     */
    expect(imageCostUsd(1920, 1088)).toBeLessThan(
      PROVIDER_COST_USD_PER_SECOND.standard
    );
  });
});
