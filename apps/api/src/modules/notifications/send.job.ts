import type { FastifyBaseLogger } from 'fastify';

import type { PrismaDb } from '../../db/prisma';
import type { EmailSendPayload } from '../../jobs/queue';
import type { EmailPort } from '../../ports/email';
import type { KeyProvider } from '../../ports/key-provider';

import { renderTemplate } from './render';
import { isSuppressed, hashEmail } from './suppression';
import { TEMPLATES, type TemplateName } from './templates';

const HEADER_INJECTION_RE = /[\r\n]/;

const guardHeaderInjection = (value: string, field: string): void => {
  if (HEADER_INJECTION_RE.test(value)) {
    throw new Error(`Header injection attempt in field "${field}"`);
  }
};

const isTemplateName = (value: string): value is TemplateName =>
  Object.prototype.hasOwnProperty.call(TEMPLATES, value);

export interface EmailSendDeps {
  readonly prisma: PrismaDb;
  readonly email: EmailPort;
  readonly log: FastifyBaseLogger;
  readonly keys: KeyProvider;
}

/**
 * `email.send` pg-boss job handler.
 * Validates, checks suppression, renders and delivers via EmailPort.
 */
export const runEmailSend = async (deps: EmailSendDeps, payload: EmailSendPayload): Promise<void> => {
  const { name, to, data, locale = 'en', dedupeKey } = payload;

  if (!isTemplateName(name)) {
    deps.log.error({ name }, 'email.send: unknown template name');
    return;
  }

  // Header injection guard
  guardHeaderInjection(to, 'to');

  const emailHash = hashEmail(deps.keys, to);
  const template = TEMPLATES[name];

  const suppressed = await isSuppressed({
    prisma: deps.prisma,
    emailHash,
    marketing: template.marketing,
  });

  if (suppressed) {
    deps.log.info({ emailHash, template: name }, 'email.suppressed');
    return;
  }

  const rendered = await renderTemplate(name, data);

  guardHeaderInjection(rendered.subject, 'subject');

  const headers: Record<string, string> = {
    'X-Locale': locale,
  };
  if (dedupeKey !== undefined) {
    headers['X-Entity-Ref-ID'] = dedupeKey;
  }

  const { messageId } = await deps.email.send({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers,
  });

  deps.log.info({ emailHash, template: name, messageId }, 'email.sent');
};
