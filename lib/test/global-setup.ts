import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  maintenanceDatabaseUrl,
  testDatabaseName,
  testDatabaseUrl,
} from './database';

/** Crée la base de données de test si besoin, puis la met à jour. */
export async function setup() {
  const name = testDatabaseName();

  const admin = postgres(maintenanceDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create database "${name}"`);
    console.log(`[test] created database ${name}`);
  } catch (error) {
    // 42P01 duplicate_database — déjà là, rien à faire.
    if ((error as { code?: string }).code !== '42P04') throw error;
  } finally {
    await admin.end();
  }

  const client = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: './lib/db/migrations' });
  } finally {
    await client.end();
  }
}
