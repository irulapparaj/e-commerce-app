import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

import { type ApiEnv, AppError } from '@pe/shared';

import { CIPHERTEXT_PREFIX, type KeyProvider } from '../key-provider';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENVELOPE_PARTS = 4;

const assertKey = (key: Buffer, label: string): Buffer => {
  if (key.length !== KEY_BYTES)
    throw new AppError('INTERNAL', `${label} must be ${KEY_BYTES} bytes`);
  return key;
};

export class EnvKeyProvider implements KeyProvider {
  private readonly encryptionKey: Buffer;
  private readonly blindIndexKey: Buffer;

  constructor(encryptionKey: Buffer, blindIndexKey: Buffer) {
    this.encryptionKey = assertKey(encryptionKey, 'Encryption key');
    this.blindIndexKey = assertKey(blindIndexKey, 'Blind index key');
  }

  static fromEnv(env: Pick<ApiEnv, 'ENCRYPTION_KEY_B64' | 'BLIND_INDEX_KEY_B64'>): EnvKeyProvider {
    return new EnvKeyProvider(
      Buffer.from(env.ENCRYPTION_KEY_B64, 'base64'),
      Buffer.from(env.BLIND_INDEX_KEY_B64, 'base64'),
    );
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${CIPHERTEXT_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${data.toString('base64url')}`;
  }

  decrypt(envelope: string): string {
    const parts = envelope.split(':');
    if (parts.length !== ENVELOPE_PARTS || `${parts[0]}:` !== CIPHERTEXT_PREFIX) {
      throw new AppError('INTERNAL', 'Unsupported ciphertext envelope');
    }
    const iv = Buffer.from(parts[1] ?? '', 'base64url');
    const tag = Buffer.from(parts[2] ?? '', 'base64url');
    const data = Buffer.from(parts[3] ?? '', 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new AppError('INTERNAL', 'Malformed ciphertext envelope');
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      throw new AppError('INTERNAL', 'Decryption failed');
    }
  }

  blindIndex(value: string): string {
    return createHmac('sha256', this.blindIndexKey).update(value, 'utf8').digest('hex');
  }
}
