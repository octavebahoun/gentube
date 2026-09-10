import { afterEach, describe, expect, it } from 'vitest';
import { assertInternalAuth, InternalAuthError, internalApiToken } from './auth';

const TOKEN = 'test-internal-api-token-not-real';
const FALLBACK = 'test-n8n-webhook-secret-not-real';

afterEach(() => {
  process.env.INTERNAL_API_TOKEN = '';
  process.env.N8N_WEBHOOK_SECRET = '';
});

describe('internalApiToken', () => {
  it('reads INTERNAL_API_TOKEN first, the name the contract uses', () => {
    process.env.INTERNAL_API_TOKEN = TOKEN;
    process.env.N8N_WEBHOOK_SECRET = FALLBACK;
    expect(internalApiToken()).toBe(TOKEN);
  });

  it('falls back to N8N_WEBHOOK_SECRET while Cosme has only posed one of the two', () => {
    process.env.INTERNAL_API_TOKEN = '';
    process.env.N8N_WEBHOOK_SECRET = FALLBACK;
    expect(internalApiToken()).toBe(FALLBACK);
  });

  it('returns null when neither is set', () => {
    expect(internalApiToken()).toBeNull();
  });
});

describe('assertInternalAuth', () => {
  it('returns 503 when the instance has no token, so n8n retries', () => {
    expect(() => assertInternalAuth({ authorization: `Bearer ${TOKEN}` })).toThrow(
      InternalAuthError
    );
    try {
      assertInternalAuth({ authorization: `Bearer ${TOKEN}` });
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 503 });
    }
  });

  it('rejects a missing or wrong Bearer with 401, without saying which', () => {
    process.env.INTERNAL_API_TOKEN = TOKEN;

    expect(() => assertInternalAuth({})).toThrow(/Unauthorized/);
    expect(() => assertInternalAuth({ authorization: `Bearer wrong-${TOKEN}` })).toThrow(
      /Unauthorized/
    );
    try {
      assertInternalAuth({ authorization: 'Bearer not-it' });
    } catch (error) {
      expect(error).toMatchObject({ name: 'InternalAuthError', statusCode: 401 });
    }
  });

  it('accepts Bearer regardless of case, and reads Headers as well as a plain object', () => {
    process.env.INTERNAL_API_TOKEN = TOKEN;

    expect(() =>
      assertInternalAuth({ authorization: `bearer ${TOKEN}` })
    ).not.toThrow();

    const headers = new Headers({ Authorization: `Bearer ${TOKEN}` });
    expect(() => assertInternalAuth(headers)).not.toThrow();
  });
});
