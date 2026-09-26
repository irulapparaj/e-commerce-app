import type { Role } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';

export interface UserState {
  readonly role: Role;
  readonly isDisabled: boolean;
  readonly isDeleted: boolean;
  readonly mfaEnabled: boolean;
}

export interface UserStateCache {
  get(userId: string): Promise<UserState | null>;
  invalidate(userId: string): void;
}

export const USER_STATE_TTL_MS = 60_000;

interface Entry {
  readonly state: UserState | null;
  readonly expiresAt: number;
}

/** Per-process cache so every authenticated request can cheaply reject disabled users (P03 task 6). */
export const createUserStateCache = (
  prisma: PrismaDb,
  now: () => number = Date.now,
  ttlMs = USER_STATE_TTL_MS,
): UserStateCache => {
  const entries = new Map<string, Entry>();
  return {
    get: async (userId) => {
      const cached = entries.get(userId);
      if (cached !== undefined && cached.expiresAt > now()) return cached.state;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, isDisabled: true, deletedAt: true, mfaEnabled: true },
      });
      const state: UserState | null =
        user === null
          ? null
          : {
              role: user.role,
              isDisabled: user.isDisabled,
              isDeleted: user.deletedAt !== null,
              mfaEnabled: user.mfaEnabled,
            };
      entries.set(userId, { state, expiresAt: now() + ttlMs });
      return state;
    },
    invalidate: (userId) => {
      entries.delete(userId);
    },
  };
};
