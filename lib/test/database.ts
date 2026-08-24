import dotenv from 'dotenv';

dotenv.config();

/**
 * Les tests ne tournent jamais sur la base de développement. L'URL ci-dessous
 * pointe vers une base sœur (`<db>_test`) que le setup global de vitest crée
 * et migre, et que chaque test tronque.
 */
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL is not set. Run `pnpm db:setup` before `pnpm test`.'
    );
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '') || 'postgres';
  if (name.endsWith('_test')) return base;

  url.pathname = `/${name}_test`;
  return url.toString();
}

export function maintenanceDatabaseUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.pathname = '/postgres';
  return url.toString();
}

export function testDatabaseName(): string {
  return new URL(testDatabaseUrl()).pathname.replace(/^\//, '');
}
