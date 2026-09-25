export interface KeyProvider {
  /** Returns a versioned envelope string: `v1:<iv>:<tag>:<ciphertext>` (base64url parts). */
  encrypt(plain: string): string;
  decrypt(envelope: string): string;
  /** Deterministic keyed hash (hex) for equality lookups on encrypted columns. */
  blindIndex(value: string): string;
}

export const CIPHERTEXT_PREFIX = 'v1:';

export const isCiphertext = (value: string): boolean => value.startsWith(CIPHERTEXT_PREFIX);
