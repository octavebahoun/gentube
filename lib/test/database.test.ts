import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  maintenanceDatabaseUrl,
  testDatabaseName,
  testDatabaseUrl,
} from './database';

const LOCAL = 'postgresql://postgres:postgres@localhost:54322/postgres';
const REMOTE =
  'postgresql://postgres.abc:secret@aws-0-eu-west-2.pooler.supabase.com:6543/postgres';

describe('testDatabaseUrl', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of [
      'DATABASE_URL',
      'TEST_DATABASE_URL',
      'ALLOW_REMOTE_TEST_DATABASE',
    ]) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('derives a sibling database instead of using the development one', () => {
    process.env.DATABASE_URL = LOCAL;
    expect(testDatabaseName()).toBe('postgres_test');
  });

  it('leaves an URL that already names a test database alone', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:54322/gentube_test';
    expect(testDatabaseName()).toBe('gentube_test');
  });

  it('lets TEST_DATABASE_URL win, so DATABASE_URL can point elsewhere', () => {
    // Le cas réel : l'app parle à Supabase, les tests au Docker local.
    process.env.DATABASE_URL = REMOTE;
    process.env.TEST_DATABASE_URL = LOCAL;
    expect(testDatabaseUrl()).toBe(LOCAL);
  });

  it('refuses a remote host, because every test truncates every table', () => {
    process.env.DATABASE_URL = REMOTE;
    expect(() => testDatabaseUrl()).toThrow(/remote database/);
  });

  it('names the offending host and where it came from', () => {
    // Sans ça, le message n'apprend pas laquelle des deux variables corriger.
    process.env.TEST_DATABASE_URL = REMOTE;
    expect(() => testDatabaseUrl()).toThrow(
      /aws-0-eu-west-2\.pooler\.supabase\.com.*TEST_DATABASE_URL/
    );
  });

  it('never leaks the password into the refusal', () => {
    // Le message finit dans les logs de CI ; l'URL entière n'a rien à y faire.
    process.env.DATABASE_URL = REMOTE;
    expect(() => testDatabaseUrl()).not.toThrow(/secret/);
  });

  it('yields to an explicit opt-out, for a disposable CI service container', () => {
    process.env.DATABASE_URL = REMOTE;
    process.env.ALLOW_REMOTE_TEST_DATABASE = '1';
    expect(testDatabaseName()).toBe('postgres_test');
  });

  it('administers from the postgres database, on the same local host', () => {
    process.env.DATABASE_URL = LOCAL;
    const url = new URL(maintenanceDatabaseUrl());
    expect(url.pathname).toBe('/postgres');
    expect(url.hostname).toBe('localhost');
  });
});
