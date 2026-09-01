import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isFreshTimestamp, verifyReplicateSignature } from './webhook';

const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const ID = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
const TIMESTAMP = '1614265330';
const BODY = '{"id":"pred_1","status":"succeeded","output":"https://x/y.mp4"}';

function sign(body = BODY, id = ID, timestamp = TIMESTAMP, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const digest = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${digest}`;
}

const verify = (over: Record<string, unknown> = {}) =>
  verifyReplicateSignature({
    id: ID,
    timestamp: TIMESTAMP,
    signature: sign(),
    rawBody: BODY,
    secret: SECRET,
    ...over,
  } as Parameters<typeof verifyReplicateSignature>[0]);

describe('verifyReplicateSignature', () => {
  it('accepte une signature calculée sur <id>.<timestamp>.<corps>', () => {
    expect(verify()).toBe(true);
  });

  it('refuse un corps modifié après signature', () => {
    expect(verify({ rawBody: BODY.replace('succeeded', 'failed') })).toBe(false);
  });

  it("refuse une signature valide pour un autre id d'événement", () => {
    expect(verify({ signature: sign(BODY, 'msg_autre') })).toBe(false);
  });

  it('refuse un autre secret', () => {
    expect(verify({ signature: sign(BODY, ID, TIMESTAMP, 'whsec_AAAA') })).toBe(
      false
    );
  });

  it('accepte quand une seule des signatures listées correspond', () => {
    // C'est la forme que prend une rotation de secret : les deux sont émises
    // côte à côte le temps de la bascule.
    expect(verify({ signature: `v1,ZmF1eA== ${sign()}` })).toBe(true);
  });

  it('traite la partie utile du secret comme du base64, pas du texte', () => {
    // Le piège du HMAC : signer la chaîne au lieu des octets décodés donne un
    // digest stable qui ne rejette rien. Ce cas échoue si on oublie le décodage.
    const key = SECRET.replace(/^whsec_/, '');
    const asText = createHmac('sha256', key)
      .update(`${ID}.${TIMESTAMP}.${BODY}`)
      .digest('base64');
    expect(verify({ signature: `v1,${asText}` })).toBe(false);
  });

  it('refuse un en-tête vide ou absent', () => {
    expect(verify({ signature: '' })).toBe(false);
    expect(verify({ signature: null })).toBe(false);
    expect(verify({ id: null })).toBe(false);
    expect(verify({ timestamp: undefined })).toBe(false);
  });

  it('refuse une signature sans le préfixe de version', () => {
    expect(verify({ signature: sign().replace('v1,', '') })).toBe(false);
  });
});

describe('isFreshTimestamp', () => {
  const now = 1_700_000_000_000;

  it('accepte un horodatage dans la tolérance', () => {
    expect(isFreshTimestamp('1699999900', { now })).toBe(true);
  });

  it('refuse un horodatage périmé', () => {
    expect(isFreshTimestamp('1699999000', { now })).toBe(false);
  });

  it('refuse un horodatage venu du futur', () => {
    expect(isFreshTimestamp('1700001000', { now })).toBe(false);
  });

  it('refuse ce qui n\'est pas un nombre', () => {
    expect(isFreshTimestamp('bientôt', { now })).toBe(false);
    expect(isFreshTimestamp(null, { now })).toBe(false);
    expect(isFreshTimestamp('0', { now })).toBe(false);
  });
});
