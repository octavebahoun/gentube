import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  maintenanceDatabaseUrl,
  testDatabaseName,
  testDatabaseUrl,
} from './database';

/** Creates the test database if needed, then brings it up to date. */
export async function setup() {
  const name = testDatabaseName();

  const admin = postgres(maintenanceDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create database "${name}"`);
    console.log(`[test] created database ${name}`);
  } catch (error) {
    // 42P01 duplicate_database — already there, nothing to do.
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
