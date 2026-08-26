import dotenv from 'dotenv';

dotenv.config();

/** Hôtes considérés comme la machine du développeur. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Les tests ne tournent jamais sur la base de développement. L'URL ci-dessous
 * pointe vers une base sœur (`<db>_test`) que le setup global de vitest crée
 * et migre, et que chaque test tronque.
 *
 * `TEST_DATABASE_URL` court-circuite la dérivation : c'est ce qu'on utilise
 * quand `DATABASE_URL` désigne une base distante (Supabase) et que les tests
 * doivent rester sur le Postgres local.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return assertLocal(explicit, 'TEST_DATABASE_URL');

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL is not set. Run `pnpm db:setup` before `pnpm test`.'
    );
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '') || 'postgres';
  if (!name.endsWith('_test')) url.pathname = `/${name}_test`;

  return assertLocal(url.toString(), 'DATABASE_URL');
}

/**
 * Refuse une base de test distante. Deux raisons, dans cet ordre : la suite
 * TRONQUE les tables entre chacun des tests, donc une erreur de branchement
 * vide une vraie base ; et le setup global fait un `create database`, ce qu'un
 * Postgres géré refuse de toute façon à travers son pooler.
 *
 * L'échappatoire est explicite parce qu'un accident, lui, ne pose pas de
 * variable d'environnement.
 */
function assertLocal(candidate: string, source: string): string {
  if (process.env.ALLOW_REMOTE_TEST_DATABASE === '1') return candidate;

  const { hostname } = new URL(candidate);
  if (LOCAL_HOSTS.has(hostname)) return candidate;

  throw new Error(
    `Refusing to run the test suite against a remote database (host ${hostname}, from ${source}). ` +
      'The suite truncates every table between tests. Start the local Postgres with ' +
      '`docker compose up -d` and set TEST_DATABASE_URL to it, or set ' +
      'ALLOW_REMOTE_TEST_DATABASE=1 if that host really is disposable.'
  );
}

export function maintenanceDatabaseUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.pathname = '/postgres';
  return url.toString();
}

export function testDatabaseName(): string {
  return new URL(testDatabaseUrl()).pathname.replace(/^\//, '');
}
