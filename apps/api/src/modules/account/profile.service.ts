import { AppError } from '@pe/shared';

import type { PrismaDb } from '../../db/prisma';

const NAME_MAX = 80;
const PHONE_REGEX = /^\+91[6-9]\d{9}$/;

export interface ProfileUpdateInput {
  readonly name?: string;
  readonly phone?: string | null;
}

export interface ProfileResult {
  readonly id: string;
  readonly name: string | null;
  readonly phone: string | null;
  readonly email: string;
}

export const updateProfile = async (
  prisma: PrismaDb,
  userId: string,
  input: ProfileUpdateInput,
): Promise<ProfileResult> => {
  if (input.name !== undefined && input.name.length > NAME_MAX) {
    throw new AppError('VALIDATION', `Name must be ${NAME_MAX} characters or fewer`);
  }
  if (input.phone !== undefined && input.phone !== null && !PHONE_REGEX.test(input.phone)) {
    throw new AppError('VALIDATION', 'Phone must be a valid Indian mobile number (+91XXXXXXXXXX)');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone }),
    },
    select: { id: true, name: true, phone: true, email: true },
  });

  return { id: updated.id, name: updated.name, phone: updated.phone, email: updated.email };
};
