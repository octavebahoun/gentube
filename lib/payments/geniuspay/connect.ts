import dotenv from 'dotenv';
import { client } from '@/lib/db/drizzle';
import {
  resolveEnvironment,
  storeCredentials,
} from '@/lib/payments/credentials';
import { GeniusPayClient } from './client';

dotenv.config();

/**
 * Stores the platform's GeniusPay merchant credentials, encrypted under
 * PAYMENT_CREDENTIALS_KEK.
 *
 * Reads them from the environment once and writes the encrypted row; after
 * this the plain values can be removed from `.env`, since nothing else reads
 * them. `GET /account` is called first because it is the only harmless way to
 * prove a key pair works — nothing is charged, and the gateway's answer says
 * which environment the keys really belong to.
 *
 *   pnpm geniuspay:connect
 */
async function main() {
  const apiKeyPublic = process.env.GENIUSPAY_API_KEY;
  const apiSecret = process.env.GENIUSPAY_SECRET;
  const webhookSecret = process.env.GENIUSPAY_WEBHOOK_SECRET;

  const missing = [
    ['GENIUSPAY_API_KEY', apiKeyPublic],
    ['GENIUSPAY_SECRET', apiSecret],
    ['GENIUSPAY_WEBHOOK_SECRET', webhookSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const environment = resolveEnvironment();
  const gateway = new GeniusPayClient(apiKeyPublic!, apiSecret!, environment);

  console.log(`Verifying ${environment} credentials against GeniusPay...`);
  const account = await gateway.getAccount();

  if (!account.success || !account.data) {
    console.error(
      `GeniusPay refused the credentials: ${account.error?.message ?? 'unknown error'}`
    );
    process.exit(1);
  }

  const reported = account.data.environment;
  if (reported && reported !== environment) {
    console.error(
      `GeniusPay reports these keys as "${reported}" but GENIUSPAY_ENV says ` +
        `"${environment}". Refusing to store a mismatch.`
    );
    process.exit(1);
  }

  const stored = await storeCredentials({
    tenantId: null, // the platform's own merchant account
    environment,
    apiKeyPublic: apiKeyPublic!,
    apiSecret: apiSecret!,
    webhookSecret: webhookSecret!,
    merchantId: String(account.data.id),
    businessName: account.data.business_name ?? account.data.name ?? null,
  });

  console.log('Credentials stored (encrypted).');
  console.log(`  merchant : ${stored.businessName ?? stored.merchantId}`);
  console.log(`  env      : ${stored.environment}`);
  console.log(`  key ver. : ${stored.keyVersion}`);
  console.log(
    '\nYou can now remove GENIUSPAY_SECRET and GENIUSPAY_WEBHOOK_SECRET from .env.'
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
