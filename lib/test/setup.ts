import { testDatabaseUrl } from './database';

// Runs before any test module is imported, so lib/db/drizzle.ts picks this up
// instead of the development database. dotenv does not override existing
// values, so this assignment wins over .env.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.AUTH_SECRET ||= 'test-auth-secret-not-used-for-anything-real';
process.env.ENCRYPTION_KEY ||=
  '0000000000000000000000000000000000000000000000000000000000000001';
// Distinct from ENCRYPTION_KEY on purpose — the separation is what the
// credential tests assert.
process.env.PAYMENT_CREDENTIALS_KEK ||=
  '0000000000000000000000000000000000000000000000000000000000000002';
process.env.GENIUSPAY_ENV ||= 'sandbox';
process.env.BASE_URL ||= 'http://localhost:3000';
