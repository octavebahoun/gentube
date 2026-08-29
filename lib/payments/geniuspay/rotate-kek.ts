import dotenv from 'dotenv';
import { client } from '@/lib/db/drizzle';
import { rotateKek } from '@/lib/payments/credentials';

dotenv.config();

/**
 * Re-wraps every stored gateway secret under a new key-encryption key.
 *
 *   1. keep the current key as OLD_PAYMENT_CREDENTIALS_KEK
 *   2. put the new one in PAYMENT_CREDENTIALS_KEK
 *   3. pnpm geniuspay:rotate-kek
 *   4. remove OLD_PAYMENT_CREDENTIALS_KEK
 */
async function main() {
  const { rotated } = await rotateKek();
  console.log(`Re-encrypted ${rotated} credential row(s) under the new KEK.`);
  console.log('Remove OLD_PAYMENT_CREDENTIALS_KEK from the environment now.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
