import dotenv from 'dotenv';

dotenv.config();

/**
 * Tests never run against the development database. The URL below points at a
 * sibling database (`<db>_test`) that the vitest global setup creates and
 * migrates, and that each test truncates.
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
