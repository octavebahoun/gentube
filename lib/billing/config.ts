/**
 * GeniusPay configuration — read from the environment, never from the database.
 *
 * The platform bills its tenants through a single merchant account, so there is
 * no per-tenant credentials table and nothing to encrypt at rest: the keys are
 * deployment configuration, like DATABASE_URL.
 *
 * Sandbox and live keys live side by side under their own names, and `GENIUS_ENV`
 * picks which set is active. Going to production is therefore adding three
 * variables, not editing three — the sandbox keys stay exactly where they are,
 * and no deploy can accidentally read one set while believing the other.
 *
 *   GENIUS_ENV=sandbox|live            (default: sandbox)
 *   GENIUS_URL_ENDPOINT=…              (default: the public merchant API)
 *   GENIUS_SANDBOX_API_KEY / _SECRET_KEY / _WEBHOOK_SECRET
 *   GENIUS_LIVE_API_KEY    / _SECRET_KEY / _WEBHOOK_SECRET
 */

export type GeniusPayEnvironment = 'sandbox' | 'live';

export type GeniusPayConfig = {
  /** Sent as `X-API-Key`. */
  apiKey: string;
  /** Sent as `X-API-Secret`. */
  apiSecret: string;
  /** HMAC key the gateway signs its webhooks with. */
  webhookSecret: string;
  environment: GeniusPayEnvironment;
  baseUrl: string;
};

const DEFAULT_BASE_URL = 'https://geniuspay.ci/api/v1/merchant';

export class BillingNotConfiguredError extends Error {
  readonly statusCode = 503;

  constructor(missing: string[]) {
    super(
      `Billing is not configured on this instance: ${missing.join(', ')} ` +
        'missing. Set them before opening sign-ups.'
    );
    this.name = 'BillingNotConfiguredError';
  }
}

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** Which key set is active. Anything but `live` is sandbox — never the reverse. */
export function geniusPayEnvironment(): GeniusPayEnvironment {
  return read('GENIUS_ENV') === 'live' ? 'live' : 'sandbox';
}

/**
 * All three secrets of the active set are required together, even though
 * checkout only needs two of them. Without the webhook secret a checkout still
 * succeeds, the tenant still pays — and nothing ever credits its balance,
 * because the confirmation can never be verified. Failing at the button is the
 * only honest behaviour.
 */
export function geniusPayConfig(): GeniusPayConfig {
  const environment = geniusPayEnvironment();
  const prefix = environment === 'live' ? 'GENIUS_LIVE' : 'GENIUS_SANDBOX';

  const names = {
    apiKey: `${prefix}_API_KEY`,
    apiSecret: `${prefix}_SECRET_KEY`,
    webhookSecret: `${prefix}_WEBHOOK_SECRET`,
  };

  const values = {
    apiKey: read(names.apiKey),
    apiSecret: read(names.apiSecret),
    webhookSecret: read(names.webhookSecret),
  };

  // The error names the variables of the active environment, so a missing live
  // key never reads as a missing sandbox one.
  const missing = (Object.keys(names) as (keyof typeof names)[])
    .filter((key) => !values[key])
    .map((key) => names[key]);

  if (missing.length > 0) {
    throw new BillingNotConfiguredError(missing);
  }

  return {
    apiKey: values.apiKey!,
    apiSecret: values.apiSecret!,
    webhookSecret: values.webhookSecret!,
    environment,
    baseUrl: (read('GENIUS_URL_ENDPOINT') ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      ''
    ),
  };
}

export function isBillingConfigured(): boolean {
  try {
    geniusPayConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Public origin used to build the URLs the gateway sends the payer back to.
 * A wrong value here strands the user on a dead page after paying, so it is
 * required rather than guessed from the request.
 */
export function appBaseUrl(): string {
  const base = read('BASE_URL');
  if (!base) {
    throw new BillingNotConfiguredError(['BASE_URL']);
  }
  return base.replace(/\/+$/, '');
}
