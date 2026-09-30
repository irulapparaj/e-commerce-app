import type { PrismaDb } from '../../db/prisma';
import type { KeyProvider } from '../../ports/key-provider';
import { isSuppressed, hashEmail } from '../notifications/suppression';

export interface SubscribeInput {
  readonly email: string;
  readonly source?: string;
}

export interface SubscribeResult {
  readonly status: 'subscribed' | 'already_subscribed' | 'suppressed';
}

export const subscribeNewsletter = async (
  prisma: PrismaDb,
  keys: KeyProvider,
  input: SubscribeInput,
): Promise<SubscribeResult> => {
  const email = input.email.toLowerCase().trim();
  const emailHash = hashEmail(keys, email);

  const suppressed = await isSuppressed({ prisma, emailHash, marketing: true });
  if (suppressed) return { status: 'suppressed' };

  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { emailHash },
    select: { status: true },
  });

  if (existing !== null && existing.status === 'SUBSCRIBED') {
    return { status: 'already_subscribed' };
  }

  const emailEncrypted = keys.encrypt(email);

  await prisma.newsletterSubscriber.upsert({
    where: { emailHash },
    create: {
      emailHash,
      emailEncrypted,
      status: 'SUBSCRIBED',
      source: input.source ?? 'storefront',
      consentAt: new Date(),
    },
    update: {
      status: 'SUBSCRIBED',
      emailEncrypted,
      consentAt: new Date(),
      unsubscribedAt: null,
    },
  });

  return { status: 'subscribed' };
};
