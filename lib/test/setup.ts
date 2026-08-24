import { testDatabaseUrl } from './database';

// S'exécute avant l'import de tout module de test, pour que lib/db/drizzle.ts
// prenne cette valeur au lieu de la base de développement. dotenv n'écrase pas
// les valeurs existantes, donc cette affectation gagne face à .env.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.AUTH_SECRET ||= 'test-auth-secret-not-used-for-anything-real';
process.env.ENCRYPTION_KEY ||=
  '0000000000000000000000000000000000000000000000000000000000000001';
