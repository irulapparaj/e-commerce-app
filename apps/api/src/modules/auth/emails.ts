import { brand } from '@pe/shared';

export interface EmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * Legacy email content helpers (P03).
 * Callers migrated to sendNow() in P13; kept for backward-compat with any residual direct send.
 * Subjects never carry the code (DESIGN §11.3).
 */
export const otpEmail = (otp: string): EmailContent => ({
  subject: 'Your sign-in code',
  text: `Your ${brand.name} sign-in code is ${otp}. It expires in 10 minutes. If you did not request it, ignore this email.`,
  html: `<p>Your ${escapeHtml(brand.name)} sign-in code is</p><p style="font-size:24px;letter-spacing:0.2em"><strong>${otp}</strong></p><p>It expires in 10 minutes. If you did not request it, ignore this email.</p>`,
});

export const staffInviteEmail = (name: string, loginUrl: string): EmailContent => ({
  subject: `You have been invited to the ${brand.name} admin console`,
  text: `Hello ${name},\n\nYou have been given access to the ${brand.name} admin console. Sign in with this email address at ${loginUrl}. You will be asked to set up an authenticator app on first login.`,
  html: `<p>Hello ${escapeHtml(name)},</p><p>You have been given access to the ${escapeHtml(brand.name)} admin console. Sign in with this email address at <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a>.</p><p>You will be asked to set up an authenticator app on first login.</p>`,
});

export const mfaResetEmail = (name: string, loginUrl: string): EmailContent => ({
  subject: `Your ${brand.name} admin authenticator was reset`,
  text: `Hello ${name},\n\nAn administrator reset the authenticator app on your ${brand.name} admin account and signed you out everywhere. Sign in at ${loginUrl} to set up a new authenticator. If you did not expect this, contact the store owner.`,
  html: `<p>Hello ${escapeHtml(name)},</p><p>An administrator reset the authenticator app on your ${escapeHtml(brand.name)} admin account and signed you out everywhere.</p><p>Sign in at <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a> to set up a new authenticator. If you did not expect this, contact the store owner.</p>`,
});
