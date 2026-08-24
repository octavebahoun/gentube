import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BillingNotConfiguredError,
  appBaseUrl,
  geniusPayConfig,
  geniusPayEnvironment,
  isBillingConfigured,
} from './config';

/**
 * `dotenv` has already loaded the developer's real .env by the time tests run,
 * so every variable this module reads is cleared and restored around each test.
 * Otherwise a machine with live keys would silently pass what a CI runner fails.
 */
const MANAGED = [
  'GENIUS_ENV',
  'GENIUS_URL_ENDPOINT',
  'GENIUS_SANDBOX_API_KEY',
  'GENIUS_SANDBOX_SECRET_KEY',
  'GENIUS_SANDBOX_WEBHOOK_SECRET',
  'GENIUS_LIVE_API_KEY',
  'GENIUS_LIVE_SECRET_KEY',
  'GENIUS_LIVE_WEBHOOK_SECRET',
  'BASE_URL',
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
});

function setSandbox() {
  process.env.GENIUS_SANDBOX_API_KEY = 'sk_sandbox_key';
  process.env.GENIUS_SANDBOX_SECRET_KEY = 'sandbox_secret';
  process.env.GENIUS_SANDBOX_WEBHOOK_SECRET = 'whsec_sandbox';
}

function setLive() {
  process.env.GENIUS_LIVE_API_KEY = 'sk_live_key';
  process.env.GENIUS_LIVE_SECRET_KEY = 'live_secret';
  process.env.GENIUS_LIVE_WEBHOOK_SECRET = 'whsec_live';
}

describe('geniusPayConfig', () => {
  it('reads the sandbox key set by default', () => {
    setSandbox();

    expect(geniusPayEnvironment()).toBe('sandbox');
    expect(geniusPayConfig()).toEqual({
      apiKey: 'sk_sandbox_key',
      apiSecret: 'sandbox_secret',
      webhookSecret: 'whsec_sandbox',
      environment: 'sandbox',
      baseUrl: 'https://geniuspay.ci/api/v1/merchant',
    });
  });

  it('switches to the live key set on GENIUS_ENV=live', () => {
    setSandbox();
    setLive();
    process.env.GENIUS_ENV = 'live';

    expect(geniusPayConfig()).toMatchObject({
      apiKey: 'sk_live_key',
      webhookSecret: 'whsec_live',
      environment: 'live',
    });
  });

  it('falls back to sandbox for any value that is not exactly live', () => {
    setSandbox();
    for (const value of ['sandbox', 'LIVE', 'production', 'prod', '']) {
      process.env.GENIUS_ENV = value;
      // Going live is an explicit act; a typo must never do it.
      expect(geniusPayConfig().environment).toBe('sandbox');
    }
  });

  it('does not let one key set satisfy the other', () => {
    // Live keys on disk, sandbox active: the sandbox keys are still required.
    setLive();

    expect(isBillingConfigured()).toBe(false);
    expect(() => geniusPayConfig()).toThrow(BillingNotConfiguredError);
  });

  it('names the missing variables of the active environment', () => {
    setSandbox();
    process.env.GENIUS_ENV = 'live';

    try {
      geniusPayConfig();
      throw new Error('expected a BillingNotConfiguredError');
    } catch (error) {
      expect(error).toBeInstanceOf(BillingNotConfiguredError);
      const message = (error as Error).message;
      expect(message).toContain('GENIUS_LIVE_API_KEY');
      expect(message).toContain('GENIUS_LIVE_SECRET_KEY');
      expect(message).toContain('GENIUS_LIVE_WEBHOOK_SECRET');
      expect(message).not.toContain('SANDBOX');
      expect((error as BillingNotConfiguredError).statusCode).toBe(503);
    }
  });

  it('requires the webhook secret together with the keys', () => {
    // A checkout would work without it; the confirmation never would.
    process.env.GENIUS_SANDBOX_API_KEY = 'sk_sandbox_key';
    process.env.GENIUS_SANDBOX_SECRET_KEY = 'sandbox_secret';

    expect(() => geniusPayConfig()).toThrow(/GENIUS_SANDBOX_WEBHOOK_SECRET/);
  });

  it('treats a blank value as missing', () => {
    setSandbox();
    process.env.GENIUS_SANDBOX_SECRET_KEY = '   ';

    expect(() => geniusPayConfig()).toThrow(/GENIUS_SANDBOX_SECRET_KEY/);
  });

  it('honours a custom endpoint and never keeps a trailing slash', () => {
    setSandbox();
    process.env.GENIUS_URL_ENDPOINT = 'https://mock.test/api/v1/merchant//';

    expect(geniusPayConfig().baseUrl).toBe('https://mock.test/api/v1/merchant');
  });

  it('reports an unconfigured instance without throwing', () => {
    expect(isBillingConfigured()).toBe(false);
    setSandbox();
    expect(isBillingConfigured()).toBe(true);
  });
});

describe('appBaseUrl', () => {
  it('strips a trailing slash', () => {
    process.env.BASE_URL = 'https://app.test/';
    expect(appBaseUrl()).toBe('https://app.test');
  });

  it('refuses to guess when BASE_URL is unset', () => {
    // A wrong origin strands the payer on a dead page after paying.
    expect(() => appBaseUrl()).toThrow(BillingNotConfiguredError);
  });
});
