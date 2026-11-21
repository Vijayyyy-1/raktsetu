import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function key(): Buffer {
  const encoded = process.env.DATA_ENCRYPTION_KEY ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(encoded)) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters');
  return Buffer.from(encoded, 'hex');
}

export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decrypt(value: string): string {
  const [iv, tag, data] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
