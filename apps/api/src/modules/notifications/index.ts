import type { FastifyBaseLogger } from 'fastify';

import type { PrismaDb } from '../../db/prisma';
import type { JobQueue } from '../../jobs/queue';
import type { EmailPort } from '../../ports/email';
import type { KeyProvider } from '../../ports/key-provider';

import { renderTemplate } from './render';
import { isSuppressed, hashEmail } from './suppression';
import { TEMPLATES, type TemplateName, type TemplateData } from './templates';

/**
 * Templates that can be sent synchronously with `sendNow`.
 * All others MUST go through the queue via `sendTemplate`.
 */
export const SYNC_TEMPLATES = ['otp', 'staff-invite', 'mfa-reenrol'] as const;
export type SyncTemplateName = (typeof SYNC_TEMPLATES)[number];

export interface SendTemplateOptions {
  readonly locale?: 'en';
  readonly dedupeKey: string;
}

export interface SendNowOptions {
  readonly locale?: 'en';
}

export interface NotificationsDeps {
  readonly jobs: JobQueue;
  readonly prisma: PrismaDb;
  readonly email: EmailPort;
  readonly log: FastifyBaseLogger;
}

/** Minimal deps for `sendNow` — does not require a job queue. */
export interface SendNowDeps {
  readonly prisma: PrismaDb;
  readonly email: EmailPort;
  readonly log?: Pick<FastifyBaseLogger, 'info'>;
  readonly keys: KeyProvider;
}

/**
 * Enqueues an `email.send` job with singleton deduplication.
 * Use for all non-latency-critical emails (orders, exports, account events).
 */
export const sendTemplate = async <N extends TemplateName>(
  deps: NotificationsDeps,
  name: N,
  to: string,
  data: TemplateData[N],
  options: SendTemplateOptions,
): Promise<{ jobId: string | null }> => {
  const jobId = await deps.jobs.send(
    'email.send',
    { name, to, data: data as unknown as Record<string, unknown>, locale: options.locale ?? 'en', dedupeKey: options.dedupeKey },
    { singletonKey: options.dedupeKey },
  );
  return { jobId };
};

const HEADER_INJECTION_RE = /[\r\n]/;

/**
 * Sends an email synchronously — for latency-critical templates only (otp, staff-invite, mfa-reenrol).
 * Checks suppression, renders, and calls EmailPort.send directly without queuing.
 */
export const sendNow = async <N extends SyncTemplateName>(
  deps: SendNowDeps,
  name: N,
  to: string,
  data: TemplateData[N],
  _options?: SendNowOptions,
): Promise<{ messageId: string }> => {
  if (HEADER_INJECTION_RE.test(to)) {
    throw new Error('Header injection attempt in field "to"');
  }

  const emailHash = hashEmail(deps.keys, to);
  const template = TEMPLATES[name];

  const suppressed = await isSuppressed({
    prisma: deps.prisma,
    emailHash,
    marketing: template.marketing,
  });

  if (suppressed) {
    deps.log?.info({ emailHash, template: name }, 'email.suppressed');
    return { messageId: '' };
  }

  const rendered = await renderTemplate(name, data);

  if (HEADER_INJECTION_RE.test(rendered.subject)) {
    throw new Error('Header injection attempt in field "subject"');
  }

  const { messageId } = await deps.email.send({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  deps.log?.info({ emailHash, template: name, messageId }, 'email.sent');

  return { messageId };
};
