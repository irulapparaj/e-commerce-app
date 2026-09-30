import { AppError } from '@pe/shared';
import type { User } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';
import type { EmailPort } from '../../ports/email';
import type { KeyProvider } from '../../ports/key-provider';
import type { PublicUser } from '../auth/refresh.service';
import { toPublicUser } from '../auth/refresh.service';
import type { SecurityEvents } from '../auth/security-events';
import { sendNow } from '../notifications';

export interface CreateStaffInput {
  readonly email: string;
  readonly name: string;
  readonly role: Extract<User['role'], 'ADMIN' | 'STAFF'>;
}

export interface CreateStaffDeps {
  readonly prisma: PrismaDb;
  readonly email: EmailPort;
  readonly events: SecurityEvents;
  readonly adminLoginUrl: string;
  readonly keys: KeyProvider;
}

/** API half of staff onboarding (P05 adds the UI): creates the account without MFA and emails an invite. */
export const createStaff = async (
  deps: CreateStaffDeps,
  input: CreateStaffInput,
  actorId: string,
): Promise<PublicUser> => {
  const existing = await deps.prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing !== null) throw new AppError('CONFLICT', 'A user with this email already exists');
  const user = await deps.prisma.user.create({
    data: { email: input.email, name: input.name, role: input.role, mfaEnabled: false },
  });
  await sendNow(
    { prisma: deps.prisma, email: deps.email, keys: deps.keys },
    'staff-invite',
    user.email,
    { name: input.name, loginUrl: deps.adminLoginUrl },
  );
  deps.events.record('auth.staff.created', { userId: user.id, role: user.role, actorId });
  return toPublicUser(user);
};
