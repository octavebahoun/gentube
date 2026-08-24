/**
 * Configuration GeniusPay — lue depuis l'environnement, jamais depuis la base.
 *
 * La plateforme facture ses tenants via un compte marchand unique, donc il
 * n'y a ni table de credentials par tenant ni rien à chiffrer au repos : les
 * clés sont de la configuration de déploiement, comme DATABASE_URL.
 *
 * Les clés sandbox et live coexistent sous leurs propres noms, et `GENIUS_ENV`
 * choisit quel jeu est actif. Passer en production revient donc à ajouter
 * trois variables, pas à en éditer trois — les clés sandbox restent exactement
 * où elles sont, et aucun déploiement ne peut lire un jeu en croyant lire
 * l'autre.
 *
 *   GENIUS_ENV=sandbox|live            (défaut : sandbox)
 *   GENIUS_URL_ENDPOINT=…              (défaut : l'API marchande publique)
 *   GENIUS_SANDBOX_API_KEY / _SECRET_KEY / _WEBHOOK_SECRET
 *   GENIUS_LIVE_API_KEY    / _SECRET_KEY / _WEBHOOK_SECRET
 */

export type GeniusPayEnvironment = 'sandbox' | 'live';

export type GeniusPayConfig = {
  /** Envoyée comme `X-API-Key`. */
  apiKey: string;
  /** Envoyé comme `X-API-Secret`. */
  apiSecret: string;
  /** Clé HMAC avec laquelle la passerelle signe ses webhooks. */
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

/** Quel jeu de clés est actif. Tout sauf `live` est sandbox — jamais l'inverse. */
export function geniusPayEnvironment(): GeniusPayEnvironment {
  return read('GENIUS_ENV') === 'live' ? 'live' : 'sandbox';
}

/**
 * Les trois secrets du jeu actif sont requis ensemble, même si le checkout
 * n'en utilise que deux. Sans le secret webhook un checkout réussit quand
 * même, le tenant paie quand même — et rien ne crédite jamais son solde,
 * car la confirmation ne peut jamais être vérifiée. Échouer au clic est le
 * seul comportement honnête.
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

  // L'erreur nomme les variables de l'environnement actif, pour qu'une clé
  // live manquante ne soit jamais lue comme une clé sandbox manquante.
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
 * Origine publique utilisée pour construire les URLs par lesquelles la
 * passerelle renvoie le payeur. Une mauvaise valeur ici laisse l'utilisateur
 * sur une page morte après avoir payé, donc c'est requis plutôt que deviné
 * depuis la requête.
 */
export function appBaseUrl(): string {
  const base = read('BASE_URL');
  if (!base) {
    throw new BillingNotConfiguredError(['BASE_URL']);
  }
  return base.replace(/\/+$/, '');
}
