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
 * Handle brut, sans scope. Le code applicatif ne doit PAS l'importer —
 * utilisez `tenantDb(tenantId)` de ./tenant-db pour que chaque requête porte
 * un filtre tenant. L'usage direct est limité aux migrations, au script de
 * seed et à la requête de résolution du tenant dans ./queries.ts.
 */
export const db = drizzle(client, { schema });
