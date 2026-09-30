import { brand } from '@pe/shared';

import type { EmailContent } from '../auth/emails';

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Minimal until P13 owns templates; the link is a 15-minute presigned GET (P08 task 6). */
export const dataExportReadyEmail = (name: string | null, url: string): EmailContent => {
  const greeting = name === null ? 'Hello' : `Hello ${name}`;
  return {
    subject: `Your ${brand.name} data export is ready`,
    text: `${greeting},\n\nThe copy of your personal data you asked for is ready. Download it within 15 minutes:\n${url}\n\nThe file is deleted after 24 hours. If you did not request this, contact us.`,
    html: `<p>${escapeHtml(greeting)},</p><p>The copy of your personal data you asked for is ready. <a href="${escapeHtml(url)}">Download it</a> within 15 minutes. The file is deleted after 24 hours.</p><p>If you did not request this, contact us.</p>`,
  };
};
