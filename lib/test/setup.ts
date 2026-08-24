import { testDatabaseUrl } from './database';

// Runs before any test module is imported, so lib/db/drizzle.ts picks this up
// instead of the development database. dotenv does not override existing
// values, so this assignment wins over .env.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.AUTH_SECRET ||= 'test-auth-secret-not-used-for-anything-real';
process.env.ENCRYPTION_KEY ||=
  '0000000000000000000000000000000000000000000000000000000000000001';
