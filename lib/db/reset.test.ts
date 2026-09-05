import { describe, expect, it, afterEach } from 'vitest';
import { resetDatabase } from './reset';

const ORIGINAL = process.env.DATABASE_URL;

afterEach(() => {
  process.env.DATABASE_URL = ORIGINAL;
});

describe('la cible du vidage', () => {
  it('refuse une base distante en la nommant', async () => {
    // Le 5 septembre 2026 ce chemin a vidé la base Supabase de production.
    process.env.DATABASE_URL =
      'postgresql://postgres:x@aws-0-eu-west-2.pooler.supabase.com:6543/postgres';

    await expect(resetDatabase()).rejects.toThrow(
      /Refusing to empty aws-0-eu-west-2\.pooler\.supabase\.com/
    );
  });

  it('refuse une URL qui n est pas une URL', async () => {
    process.env.DATABASE_URL = 'pas-une-url';
    await expect(resetDatabase()).rejects.toThrow(/not a valid URL/);
  });

  it('refuse quand rien n est configuré', async () => {
    delete process.env.DATABASE_URL;
    await expect(resetDatabase()).rejects.toThrow(/is not set/);
  });
});
