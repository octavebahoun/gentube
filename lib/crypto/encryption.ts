import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * AES-256-GCM helper for secrets stored at rest (specs §5): YouTube OAuth
 * access/refresh tokens today, any other provider credential later.
 *
 * Payload format: `v1:<base64(iv | authTag | ciphertext)>`
 * — 12-byte IV, 16-byte auth tag, both random/derived per call, so encrypting
 * the same token twice never yields the same string.
 *
 * ENCRYPTION_KEY must be 32 bytes, given as 64 hex chars or 44 base64 chars:
 *   openssl rand -hex 32
 */

const VERSION = 'v1';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionKeyError';
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');

  if (key.length !== KEY_LENGTH) {
    throw new EncryptionKeyError(
      `ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes, got ${key.length}. ` +
        'Generate one with: openssl rand -hex 32'
    );
  }
  return key;
}

/** Resolved lazily so importing this module never crashes a build. */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new EncryptionKeyError('ENCRYPTION_KEY environment variable is not set.');
  }
  cachedKey = parseKey(raw);
  return cachedKey;
}

/** Test hook: forget the memoised key after changing process.env. */
export function resetEncryptionKeyCache(): void {
  cachedKey = null;
}

export function encrypt(plaintext: string, key: Buffer = getEncryptionKey()): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return `${VERSION}:${payload.toString('base64')}`;
}

export function decrypt(payload: string, key: Buffer = getEncryptionKey()): string {
  const [version, body] = payload.split(':', 2);
  if (version !== VERSION || !body) {
    throw new DecryptionError('Unrecognised ciphertext format.');
  }

  const raw = Buffer.from(body, 'base64');
  if (raw.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new DecryptionError('Ciphertext is truncated.');
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key or tampered payload — never echo the ciphertext in the error.
    throw new DecryptionError('Failed to decrypt: bad key or tampered payload.');
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

/** Constant-time comparison for webhook signatures (Replicate, GeniusPay). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
