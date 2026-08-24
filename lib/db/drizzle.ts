import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const client = postgres(process.env.DATABASE_URL);

/**
 * Raw, unscoped handle. Application code must NOT import this — use
 * `tenantDb(tenantId)` from ./tenant-db so every query carries a tenant
 * filter. Direct use is limited to migrations, the seed script and the
 * tenant-resolution query in ./queries.ts.
 */
export const db = drizzle(client, { schema });
