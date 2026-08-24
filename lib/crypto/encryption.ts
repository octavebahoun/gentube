import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Aide AES-256-GCM pour les secrets stockés au repos (cahier des charges §5) :
 * tokens OAuth YouTube access/refresh aujourd'hui, toute autre credential de
 * fournisseur plus tard.
 *
 * Format du payload : `v1:<base64(iv | authTag | ciphertext)>`
 * — IV de 12 octets, tag d'authentification de 16 octets, tous deux
 * aléatoires/dérivés par appel, donc chiffrer deux fois le même token ne donne
 * jamais la même chaîne.
 *
 * ENCRYPTION_KEY doit faire 32 octets, donnée en 64 caractères hex ou 44
 * caractères base64 :
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

/** Résolue paresseusement pour qu'importer ce module ne fasse jamais planter un build. */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new EncryptionKeyError('ENCRYPTION_KEY environment variable is not set.');
  }
  cachedKey = parseKey(raw);
  return cachedKey;
}

/** Crochet de test : oublie la clé mémoïsée après modification de process.env. */
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
    // Mauvaise clé ou payload altéré — ne jamais renvoyer le ciphertext dans l'erreur.
    throw new DecryptionError('Failed to decrypt: bad key or tampered payload.');
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

/** Comparaison en temps constant pour les signatures webhook (Replicate, GeniusPay). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
