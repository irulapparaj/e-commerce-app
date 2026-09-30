import type { SuppressionReason } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';
import type { KeyProvider } from '../../ports/key-provider';

/** HMAC-SHA-256 blind index of the lowercased email address (BL-12: keyed to prevent rainbow-table reversal). */
export const hashEmail = (keys: KeyProvider, email: string): string =>
  keys.blindIndex(email.toLowerCase().trim());

export interface AddSuppressionOptions {
  readonly prisma: PrismaDb;
  readonly emailHash: string;
  readonly reason: SuppressionReason;
}

/** Upsert a suppression entry (idempotent; does not fail if already present). */
export const addSuppression = async (options: AddSuppressionOptions): Promise<void> => {
  await options.prisma.emailSuppression.upsert({
    where: { emailHash: options.emailHash },
    update: { reason: options.reason },
    create: { emailHash: options.emailHash, reason: options.reason },
  });
};

export interface IsSupressedOptions {
  readonly prisma: PrismaDb;
  readonly emailHash: string;
  /** When true, UNSUBSCRIBE also blocks the send (marketing template). */
  readonly marketing: boolean;
}

/**
 * Returns true when the address must not receive this email.
 * - BOUNCE (hard) and COMPLAINT block all mail.
 * - UNSUBSCRIBE only blocks marketing templates.
 */
export const isSuppressed = async (options: IsSupressedOptions): Promise<boolean> => {
  const record = await options.prisma.emailSuppression.findUnique({
    where: { emailHash: options.emailHash },
    select: { reason: true },
  });
  if (record === null) return false;
  if (record.reason === 'BOUNCE' || record.reason === 'COMPLAINT') return true;
  if (record.reason === 'UNSUBSCRIBE' && options.marketing) return true;
  return false;
};
