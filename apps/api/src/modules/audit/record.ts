import { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

import type { PrismaTx } from '../../db/prisma';

/** Keys never persisted in `before`/`after` (PII and secrets), matched case-insensitively at any depth. */
export const AUDIT_REDACTED_KEYS: readonly string[] = [
  'phone',
  'phoneHmac',
  'line1',
  'line2',
  'totpSecret',
  'mfaRecoveryCodes',
  'recoveryCodes',
  'token',
  'tokens',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'mfaToken',
  'csrfToken',
  'otp',
  'password',
  'secret',
  'signature',
];

const REDACTED = new Set(AUDIT_REDACTED_KEYS.map((key) => key.toLowerCase()));
const MAX_DEPTH = 12;

export interface AuditActor {
  readonly actorId: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface AuditInput extends AuditActor {
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
}

export type AuditTx = Pick<PrismaTx, 'auditLog'>;

export const SYSTEM_ACTOR: AuditActor = { actorId: null, ip: null, userAgent: null };

/** Serialises through JSON first so Dates, Decimals and class instances become plain values. */
const toPlain = (value: unknown): unknown =>
  value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown);

export const redactAudit = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redactAudit(item, depth + 1));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !REDACTED.has(key.toLowerCase()))
      .map(([key, item]) => [key, redactAudit(item, depth + 1)]),
  );
};

const toJson = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined => {
  const plain = toPlain(value);
  if (plain === undefined) return undefined;
  if (plain === null) return Prisma.JsonNull;
  return redactAudit(plain) as Prisma.InputJsonValue;
};

/** The single audit primitive (P04 task 12); every service writes through it inside its transaction. */
export const recordAudit = async (tx: AuditTx, input: AuditInput): Promise<{ id: string }> => {
  const before = toJson(input.before);
  const after = toJson(input.after);
  return tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
      ip: input.ip,
      userAgent: input.userAgent,
    },
    select: { id: true },
  });
};

export const actorFromRequest = (request: FastifyRequest): AuditActor => ({
  actorId: request.user?.id ?? null,
  ip: request.ip,
  userAgent: request.headers['user-agent'] ?? null,
});
