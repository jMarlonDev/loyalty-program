import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

function parseKey(key: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(key))
    throw new Error('Invalid card encryption key.');
  return Buffer.from(key, 'hex');
}
export function hashCardToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function encryptCardToken(token: string, key: string): string {
  const secret = parseKey(key),
    iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', secret, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}
export function decryptCardToken(encrypted: string, key: string): string {
  const secret = parseKey(key);
  if (!/^v1:[0-9a-f]{24}:[0-9a-f]{32}:(?:[0-9a-f]{2})+$/i.test(encrypted))
    throw new Error('Invalid card token ciphertext.');
  const [, iv, tag, payload] = encrypted.split(':');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    secret,
    Buffer.from(iv as string, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tag as string, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload as string, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
export function createCardToken(): string {
  return randomBytes(32).toString('base64url');
}
