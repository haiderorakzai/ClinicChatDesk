import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [kind, salt64, hash64] = String(stored).split('$');
    if (kind !== 'scrypt' || !salt64 || !hash64) return false;
    const salt = Buffer.from(salt64, 'base64url');
    const expected = Buffer.from(hash64, 'base64url');
    const actual = scryptSync(String(password), salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function encryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY || '';
  if (!raw) throw new Error('APP_ENCRYPTION_KEY is not configured.');
  const buf = Buffer.from(raw, 'base64url');
  if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be a 32-byte base64url key. Run npm run secrets.');
  return buf;
}

export function encryptSecret(value) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(value) {
  if (!value) return null;
  const [v, iv64, tag64, data64] = String(value).split('.');
  if (v !== 'v1') throw new Error('Unsupported encrypted value.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data64, 'base64url')), decipher.final()]).toString('utf8');
}
