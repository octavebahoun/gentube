import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvalidAssetKeyError, StorageNotConfiguredError } from './index';
import { R2Store, createAssetStore, r2Config } from './r2';

const VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_PREFIX',
] as const;

const saved = new Map(VARS.map((v) => [v, process.env[v]]));

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function configure(overrides: Partial<Record<(typeof VARS)[number], string>> = {}) {
  process.env.R2_ACCOUNT_ID = 'acc';
  process.env.R2_ACCESS_KEY_ID = 'key';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  process.env.R2_BUCKET = 'gentube-assets';
  delete process.env.R2_ENDPOINT;
  delete process.env.R2_PREFIX;
  for (const [name, value] of Object.entries(overrides)) {
    process.env[name] = value;
  }
}

/** Client S3 factice : on veut voir la commande envoyée, pas parler au réseau. */
function fakeClient() {
  const sent: any[] = [];
  return {
    sent,
    client: { send: vi.fn(async (command: any) => void sent.push(command)) } as any,
  };
}

describe('r2Config', () => {
  it('names every missing variable instead of failing later on the network', () => {
    for (const name of VARS) delete process.env[name];
    try {
      r2Config();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(StorageNotConfiguredError);
      expect((error as Error).message).toContain('R2_ACCOUNT_ID');
      expect((error as Error).message).toContain('R2_BUCKET');
    }
  });

  it('treats a blank variable as missing', () => {
    configure({ R2_SECRET_ACCESS_KEY: '   ' });
    expect(() => r2Config()).toThrow(StorageNotConfiguredError);
  });

  it('derives the endpoint from the account when R2_ENDPOINT is empty', () => {
    // C'est exactement le cas de notre .env : la variable existe mais est vide.
    configure({ R2_ENDPOINT: '' });
    expect(r2Config().endpoint).toBe('https://acc.r2.cloudflarestorage.com');
  });

  it('keeps an explicit endpoint, for a bucket behind a custom domain', () => {
    configure({ R2_ENDPOINT: 'https://files.gentube.app' });
    expect(r2Config().endpoint).toBe('https://files.gentube.app');
  });

  it('normalises the shared-bucket prefix and refuses one that climbs out', () => {
    configure({ R2_PREFIX: '/gentube/' });
    expect(r2Config().prefix).toBe('gentube');

    configure({ R2_PREFIX: 'gentube/../renderx' });
    expect(() => r2Config()).toThrow(InvalidAssetKeyError);
  });

  it('has no prefix when the bucket is ours alone', () => {
    configure();
    expect(r2Config().prefix).toBe('');
  });
});

describe('R2Store', () => {
  const base = {
    accountId: 'acc',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    bucket: 'gentube-assets',
    endpoint: 'https://acc.r2.cloudflarestorage.com',
    prefix: '',
  };

  it('stores the bytes and returns the application key, not a URL', async () => {
    const { client, sent } = fakeClient();
    const store = new R2Store(base, client);

    const key = await store.put('7/voice/42/1.mp3', Buffer.from('x'), 'audio/mpeg');

    // Une URL expire, une clé non — c'est la clé qui est stockée en base.
    expect(key).toBe('7/voice/42/1.mp3');
    expect(sent[0].input).toMatchObject({
      Bucket: 'gentube-assets',
      Key: '7/voice/42/1.mp3',
      ContentType: 'audio/mpeg',
    });
  });

  it('moves the object under the prefix without moving the application key', async () => {
    const { client, sent } = fakeClient();
    const store = new R2Store({ ...base, prefix: 'gentube' }, client);

    const key = await store.put('7/voice/42/1.mp3', Buffer.from('x'), 'audio/mpeg');

    // La clé applicative garde le tenant en tête, sinon keyBelongsToTenant()
    // cesserait de protéger quoi que ce soit.
    expect(key).toBe('7/voice/42/1.mp3');
    expect(sent[0].input.Key).toBe('gentube/7/voice/42/1.mp3');
  });

  it('refuses a hand-made key that could reach another tenant', async () => {
    const { client } = fakeClient();
    const store = new R2Store(base, client);

    for (const key of ['', '/7/a.mp3', '7//a.mp3', '7/../8/a.mp3', '7/./a.mp3']) {
      await expect(store.put(key, Buffer.from('x'), 'audio/mpeg')).rejects.toThrow(
        InvalidAssetKeyError
      );
      await expect(store.signedUrl(key)).rejects.toThrow(InvalidAssetKeyError);
    }
  });

  it('signs a short-lived URL rather than exposing a public one', async () => {
    const store = new R2Store({ ...base, prefix: 'gentube' });

    const url = await store.signedUrl('7/voice/42/1.mp3', 60);

    // Le SDK signe en virtual-hosted style : le bucket est dans l'hôte, le
    // préfixe et la clé dans le chemin.
    expect(url).toContain('https://gentube-assets.acc.r2.cloudflarestorage.com/');
    expect(url).toContain('/gentube/7/voice/42/1.mp3?');
    expect(url).toContain('X-Amz-Expires=60');
    expect(url).toContain('X-Amz-Signature=');
    // Le secret ne doit jamais se retrouver dans une URL remise au client.
    expect(url).not.toContain('secret');
  });
});

describe('createAssetStore', () => {
  it('refuses to build a store when the instance is not configured', () => {
    for (const name of VARS) delete process.env[name];
    expect(() => createAssetStore()).toThrow(StorageNotConfiguredError);
  });

  it('builds one once the variables are there', () => {
    configure();
    expect(createAssetStore()).toBeInstanceOf(R2Store);
  });
});
