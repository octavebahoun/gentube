import { beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  DecryptionError,
  EncryptionKeyError,
  decrypt,
  encrypt,
  getEncryptionKey,
  isEncrypted,
  resetEncryptionKeyCache,
  safeEqual,
} from './encryption';

const HEX_KEY = 'a'.repeat(64);

describe('encryption', () => {
  beforeEach(() => {
    resetEncryptionKeyCache();
    process.env.ENCRYPTION_KEY = HEX_KEY;
  });

  it('round-trips a token', () => {
    const token = 'ya29.a0AfB_byC-not-a-real-youtube-token';
    expect(decrypt(encrypt(token))).toBe(token);
  });

  it('produces a different ciphertext every time (random IV)', () => {
    const a = encrypt('same input');
    const b = encrypt('same input');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it('never leaks the plaintext into the ciphertext', () => {
    const secret = 'refresh-token-1234';
    expect(encrypt(secret)).not.toContain(secret);
  });

  it('tags the payload with a format version', () => {
    const payload = encrypt('x');
    expect(payload.startsWith('v1:')).toBe(true);
    expect(isEncrypted(payload)).toBe(true);
    expect(isEncrypted('plain-token')).toBe(false);
  });

  it('rejects a payload encrypted under a different key', () => {
    const payload = encrypt('secret', randomBytes(32));
    expect(() => decrypt(payload)).toThrow(DecryptionError);
  });

  it('rejects a tampered payload (GCM auth tag)', () => {
    const payload = encrypt('secret');
    const body = Buffer.from(payload.slice(3), 'base64');
    body[body.length - 1] ^= 0xff;
    expect(() => decrypt(`v1:${body.toString('base64')}`)).toThrow(
      DecryptionError
    );
  });

  it('rejects a malformed payload', () => {
    expect(() => decrypt('not-encrypted')).toThrow(DecryptionError);
    expect(() => decrypt('v1:AAAA')).toThrow(DecryptionError);
  });

  it('accepts a base64 key as well as hex', () => {
    const raw = randomBytes(32);
    process.env.ENCRYPTION_KEY = raw.toString('base64');
    resetEncryptionKeyCache();
    expect(getEncryptionKey().equals(raw)).toBe(true);
  });

  it('refuses a key that is not 32 bytes', () => {
    process.env.ENCRYPTION_KEY = 'too-short';
    resetEncryptionKeyCache();
    expect(() => getEncryptionKey()).toThrow(EncryptionKeyError);
  });

  it('refuses a missing key', () => {
    delete process.env.ENCRYPTION_KEY;
    resetEncryptionKeyCache();
    expect(() => getEncryptionKey()).toThrow(EncryptionKeyError);
  });

  it('compares signatures without leaking length mismatches as throws', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
