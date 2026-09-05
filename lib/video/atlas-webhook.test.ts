import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAtlasKeys,
  forgetAtlasKeys,
  lireAtlas,
  verifyAtlasSignature,
  type AtlasJwk,
} from './atlas-webhook';

/** Une paire Ed25519 et son JWK, exactement comme Atlas les publie. */
function paire(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as AtlasJwk;
  return { privateKey, jwk: { ...jwk, kid, use: 'sig', alg: 'EdDSA' } };
}

/** Signe `<timestamp>.<corps>`, la chaîne que la doc d'Atlas décrit. */
function signer(privateKey: ReturnType<typeof paire>['privateKey'], timestamp: string, rawBody: string) {
  return sign(null, Buffer.from(`${timestamp}.${rawBody}`), privateKey).toString(
    'base64url'
  );
}

const CORPS = JSON.stringify({
  session_id: '6a0c02cdb4b147b7bc78881eb7229ece',
  payload: { status: 'completed', outputs: ['https://cdn/clip.mp4'] },
});
const T = '1782295062';

let fetchOrigine: typeof globalThis.fetch;

beforeEach(() => {
  fetchOrigine = globalThis.fetch;
  forgetAtlasKeys();
  process.env.ATLAS_API_KEY = 'atl_test';
});

afterEach(() => {
  globalThis.fetch = fetchOrigine;
  forgetAtlasKeys();
  process.env.ATLAS_API_KEY = '';
});

describe('la signature Ed25519', () => {
  it('accepte une charge signée par la clé annoncée', () => {
    const { privateKey, jwk } = paire('k1');

    expect(
      verifyAtlasSignature({
        timestamp: T,
        signature: signer(privateKey, T, CORPS),
        keyId: 'k1',
        rawBody: CORPS,
        keys: [jwk],
      })
    ).toBe(true);
  });

  it('refuse une charge modifiée d un octet', () => {
    // C est tout l objet de la vérification : sans elle, n importe qui pose
    // l URL de son choix sur un plan.
    const { privateKey, jwk } = paire('k1');
    const signature = signer(privateKey, T, CORPS);

    expect(
      verifyAtlasSignature({
        timestamp: T,
        signature,
        keyId: 'k1',
        rawBody: CORPS.replace('clip.mp4', 'clip.mp5'),
        keys: [jwk],
      })
    ).toBe(false);
  });

  it('refuse une signature valide sur un autre horodatage', () => {
    // L horodatage fait partie du message signé : le rejouer avec un autre
    // ferait passer un rappel périmé pour frais.
    const { privateKey, jwk } = paire('k1');

    expect(
      verifyAtlasSignature({
        timestamp: '1782299999',
        signature: signer(privateKey, T, CORPS),
        keyId: 'k1',
        rawBody: CORPS,
        keys: [jwk],
      })
    ).toBe(false);
  });

  it('refuse une clé qui n a pas signé', () => {
    const { jwk } = paire('k1');
    const autre = paire('k2');

    expect(
      verifyAtlasSignature({
        timestamp: T,
        signature: signer(autre.privateKey, T, CORPS),
        keyId: 'k1',
        rawBody: CORPS,
        keys: [jwk],
      })
    ).toBe(false);
  });

  it('essaie toutes les clés quand le kid est inconnu', () => {
    /*
     * Pendant une rotation, les deux formes circulent. Le `kid` restreint les
     * candidates, il n autorise pas : c est la signature qui décide. Rejeter
     * sur un kid inconnu perdrait des clips déjà payés.
     */
    const ancienne = paire('k1');
    const nouvelle = paire('k2');

    expect(
      verifyAtlasSignature({
        timestamp: T,
        signature: signer(nouvelle.privateKey, T, CORPS),
        keyId: 'inconnu',
        rawBody: CORPS,
        keys: [ancienne.jwk, nouvelle.jwk],
      })
    ).toBe(true);
  });

  it('refuse ce qui n est pas une signature', () => {
    const { jwk } = paire('k1');
    const args = { timestamp: T, keyId: 'k1', rawBody: CORPS, keys: [jwk] };

    expect(verifyAtlasSignature({ ...args, signature: null })).toBe(false);
    expect(verifyAtlasSignature({ ...args, signature: '' })).toBe(false);
    expect(verifyAtlasSignature({ ...args, signature: 'pas-du-base64url!!' })).toBe(false);
    expect(verifyAtlasSignature({ ...args, timestamp: null, signature: 'x' })).toBe(false);
  });

  it('ne tombe pas sur une clé malformée dans le jeu', () => {
    // Une entrée cassée dans le JWKS ne doit pas emporter les autres.
    const { privateKey, jwk } = paire('k1');

    expect(
      verifyAtlasSignature({
        timestamp: T,
        signature: signer(privateKey, T, CORPS),
        rawBody: CORPS,
        keys: [{ kty: 'RSA' }, { kty: 'OKP', crv: 'Ed25519', x: 'pas-une-cle' }, jwk],
      })
    ).toBe(true);
  });
});

describe('le jeu de clés', () => {
  function jwks(keys: AtlasJwk[], status = 200) {
    return vi.fn().mockResolvedValue({
      ok: status === 200,
      status,
      json: async () => ({ keys }),
    } as unknown as Response);
  }

  it('ne redemande pas les clés à chaque rappel', async () => {
    // Quinze plans font quinze rappels en rafale : les joindre quinze fois
    // ajouterait quinze allers-retours sur le chemin critique.
    const { jwk } = paire('k1');
    const appel = jwks([jwk]);
    globalThis.fetch = appel;

    await fetchAtlasKeys({ now: 1_000 });
    await fetchAtlasKeys({ now: 2_000 });

    expect(appel).toHaveBeenCalledTimes(1);
  });

  it('les redemande quand on l exige', async () => {
    // Le rattrapage d une rotation : sans lui, une clé tournée coûterait une
    // heure de 401 et Atlas ne redélivre qu une dizaine de fois.
    const { jwk } = paire('k1');
    globalThis.fetch = jwks([jwk]);

    await fetchAtlasKeys({ now: 1_000 });
    await fetchAtlasKeys({ now: 2_000, fresh: true });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('refuse de se taire quand le JWKS est injoignable', async () => {
    // Sans clé publique on ne peut ni vérifier ni refuser franchement : il
    // faut que ça remonte, pour qu Atlas redélivre.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

    await expect(fetchAtlasKeys()).rejects.toThrow(/JWKS is unreachable/);
  });

  it('refuse un JWKS vide', async () => {
    globalThis.fetch = jwks([]);
    await expect(fetchAtlasKeys()).rejects.toThrow(/no key/);
  });
});

describe('la lecture d un rappel', () => {
  it('lit l état sous payload, pas à la racine', () => {
    expect(
      lireAtlas({ payload: { status: 'completed', outputs: ['https://cdn/c.mp4'] } })
    ).toEqual({ status: 'succeeded', videoUrl: 'https://cdn/c.mp4' });
  });

  it('compte un dépassement de délai comme un échec', () => {
    expect(lireAtlas({ payload: { status: 'timeout' } })).toEqual({
      status: 'failed',
      error: 'Prediction timeout.',
    });
  });

  it('garde le message d erreur de la racine', () => {
    // Atlas met le détail dans `error` à la racine, pas dans `payload`.
    expect(
      lireAtlas({ payload: { status: 'failed' }, error: 'nsfw content' })
    ).toEqual({ status: 'failed', error: 'nsfw content' });
  });

  it('rend null sur une réussite sans sortie', () => {
    // Une charge malformée, pas un état : le distinguer évite de marquer prêt
    // un plan qui n a pas de fichier.
    expect(lireAtlas({ payload: { status: 'completed', outputs: [] } })).toBeNull();
  });

  it('laisse en attente un état intermédiaire', () => {
    expect(lireAtlas({ payload: { status: 'processing' } })).toEqual({
      status: 'pending',
    });
  });
});
