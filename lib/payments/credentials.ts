import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  gatewayCredentials,
  type GatewayCredential,
  type GatewayEnvironment,
} from '@/lib/db/schema';
import {
  EncryptionKeyError,
  decrypt,
  encrypt,
  parseKeyMaterial,
} from '@/lib/crypto/encryption';

/**
 * Gateway credential vault.
 *
 * Secrets are encrypted with AES-256-GCM under `PAYMENT_CREDENTIALS_KEK` — a
 * key-encryption key deliberately separate from `ENCRYPTION_KEY`, which
 * protects YouTube tokens. Losing one must not expose the other; money and
 * video publishing are different blast radii.
 *
 * The decrypted secret has exactly one destination: a `GeniusPayClient`. There
 * is no exported function that returns it as a plain value to a caller that
 * could serialise it, and `redact()` is the only shape allowed into an HTTP
 * response. `server-only` makes importing this from a client component a build
 * error rather than a leak.
 */

const KEK_ENV = 'PAYMENT_CREDENTIALS_KEK';
const OLD_KEK_ENV = 'OLD_PAYMENT_CREDENTIALS_KEK';

let cachedKek: Buffer | null = null;

/**
 * No fallback value on purpose: a default would be identical in every
 * deployment and readable in this repository, so a missing key must fail
 * loudly rather than encrypt production secrets under a known one.
 */
export function getPaymentKek(): Buffer {
  if (cachedKek) return cachedKek;

  const raw = process.env[KEK_ENV];
  if (!raw) {
    throw new EncryptionKeyError(
      `${KEK_ENV} is not set — refusing to handle gateway credentials without it. ` +
        'Generate one with: openssl rand -hex 32'
    );
  }
  cachedKek = parseKeyMaterial(raw, KEK_ENV);
  return cachedKek;
}

/** Test hook: forget the memoised KEK after changing process.env. */
export function resetPaymentKekCache(): void {
  cachedKek = null;
}

/** Everything about a credential that is safe to serialise. */
export type RedactedCredential = {
  id: number;
  tenantId: number | null;
  provider: string;
  environment: GatewayEnvironment;
  apiKeyPublic: string;
  keyVersion: number;
  merchantId: string | null;
  businessName: string | null;
  status: GatewayCredential['status'];
  lastVerifiedAt: Date | null;
};

/**
 * The only projection of a credential allowed to leave the server. The public
 * API key is included because it is public by definition; the two encrypted
 * columns are not selected at all, so no future refactor can widen this by
 * spreading the row.
 */
export function redact(credential: GatewayCredential): RedactedCredential {
  return {
    id: credential.id,
    tenantId: credential.tenantId,
    provider: credential.provider,
    environment: credential.environment,
    apiKeyPublic: credential.apiKeyPublic,
    keyVersion: credential.keyVersion,
    merchantId: credential.merchantId,
    businessName: credential.businessName,
    status: credential.status,
    lastVerifiedAt: credential.lastVerifiedAt,
  };
}

export type DecryptedCredential = {
  row: GatewayCredential;
  apiKeyPublic: string;
  apiSecret: string;
  webhookSecret: string;
};

/**
 * Reads the platform's own merchant credentials — the account that bills
 * tenants. This is one of two places that queries a NULL `tenant_id` row on
 * purpose (the other is the webhook pipeline, before the tenant is known);
 * everything else goes through `tenantDb()`.
 */
export async function getPlatformCredentials(
  environment: GatewayEnvironment = resolveEnvironment()
): Promise<DecryptedCredential | null> {
  const [row] = await db
    .select()
    .from(gatewayCredentials)
    .where(
      and(
        isNull(gatewayCredentials.tenantId),
        eq(gatewayCredentials.provider, 'geniuspay'),
        eq(gatewayCredentials.environment, environment),
        eq(gatewayCredentials.status, 'active')
      )
    )
    .limit(1);

  if (!row) return null;

  const kek = getPaymentKek();
  return {
    row,
    apiKeyPublic: row.apiKeyPublic,
    apiSecret: decrypt(row.apiSecretEncrypted, kek),
    webhookSecret: decrypt(row.webhookSecretEncrypted, kek),
  };
}

export type StoreCredentialsInput = {
  tenantId?: number | null;
  environment: GatewayEnvironment;
  apiKeyPublic: string;
  apiSecret: string;
  webhookSecret: string;
  merchantId?: string | null;
  businessName?: string | null;
};

/**
 * Writes (or replaces) a credential row. Returns the redacted shape — never
 * the secrets it was just handed.
 */
export async function storeCredentials(
  input: StoreCredentialsInput
): Promise<RedactedCredential> {
  const kek = getPaymentKek();
  const tenantId = input.tenantId ?? null;

  const values = {
    tenantId,
    provider: 'geniuspay',
    environment: input.environment,
    apiKeyPublic: input.apiKeyPublic,
    apiSecretEncrypted: encrypt(input.apiSecret, kek),
    webhookSecretEncrypted: encrypt(input.webhookSecret, kek),
    merchantId: input.merchantId ?? null,
    businessName: input.businessName ?? null,
    status: 'active' as const,
    lastVerifiedAt: new Date(),
    updatedAt: new Date(),
  };

  const existing = await db
    .select()
    .from(gatewayCredentials)
    .where(
      and(
        tenantId === null
          ? isNull(gatewayCredentials.tenantId)
          : eq(gatewayCredentials.tenantId, tenantId),
        eq(gatewayCredentials.provider, 'geniuspay'),
        eq(gatewayCredentials.environment, input.environment)
      )
    )
    .limit(1);

  const [row] = existing.length
    ? await db
        .update(gatewayCredentials)
        .set(values)
        .where(eq(gatewayCredentials.id, existing[0].id))
        .returning()
    : await db.insert(gatewayCredentials).values(values).returning();

  return redact(row);
}

/**
 * Re-wraps every stored secret under a new KEK.
 *
 * Run with the previous key in `OLD_PAYMENT_CREDENTIALS_KEK` and the new one in
 * `PAYMENT_CREDENTIALS_KEK`, then drop the old variable. Rows carry
 * `key_version` so a half-finished rotation is visible rather than silent.
 */
export async function rotateKek(): Promise<{ rotated: number }> {
  const oldRaw = process.env[OLD_KEK_ENV];
  if (!oldRaw) {
    throw new EncryptionKeyError(
      `${OLD_KEK_ENV} is not set — nothing to rotate from.`
    );
  }

  const oldKek = parseKeyMaterial(oldRaw, OLD_KEK_ENV);
  const newKek = getPaymentKek();
  if (oldKek.equals(newKek)) {
    throw new EncryptionKeyError(
      `${OLD_KEK_ENV} and ${KEK_ENV} are identical — that is not a rotation.`
    );
  }

  const rows = await db.select().from(gatewayCredentials);
  let rotated = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const apiSecret = decrypt(row.apiSecretEncrypted, oldKek);
      const webhookSecret = decrypt(row.webhookSecretEncrypted, oldKek);

      await tx
        .update(gatewayCredentials)
        .set({
          apiSecretEncrypted: encrypt(apiSecret, newKek),
          webhookSecretEncrypted: encrypt(webhookSecret, newKek),
          keyVersion: row.keyVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(gatewayCredentials.id, row.id));

      rotated += 1;
    }
  });

  return { rotated };
}

/** Which gateway environment this deployment talks to. */
export function resolveEnvironment(): GatewayEnvironment {
  return process.env.GENIUSPAY_ENV === 'live' ? 'live' : 'sandbox';
}
