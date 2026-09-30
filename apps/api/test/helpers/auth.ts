import { authenticator } from 'otplib';

import type { TestApp } from './app';
import { readMailpitText, searchMailpit } from './mailpit';

export const OTP_IN_TEXT = /\b(\d{6})\b/;

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly csrfToken: string;
  readonly audience: 'storefront' | 'admin';
  readonly sessionId: string;
  readonly user: { id: string; email: string; role: string; mfaEnabled: boolean };
}

export interface MfaChallenge {
  readonly mfaToken: string;
  readonly mfaRequired?: boolean;
  readonly mfaEnrolmentRequired?: boolean;
}

const json = <T>(res: { body: string }): T => (JSON.parse(res.body) as { data: T }).data;

/** Reads the OTP from the fake email adapter (unit/integration) or Mailpit (E2E-style runs). */
export const readOtp = async (testApp: TestApp, email: string): Promise<string> => {
  if (testApp.email !== null) {
    const message = testApp.email.lastTo(email);
    const match = message === undefined ? null : OTP_IN_TEXT.exec(message.text);
    if (match?.[1] === undefined) throw new Error(`no OTP email captured for ${email}`);
    return match[1];
  }
  const [found] = await searchMailpit(email);
  if (found === undefined) throw new Error(`no OTP email in Mailpit for ${email}`);
  const match = OTP_IN_TEXT.exec(await readMailpitText(found.ID));
  if (match?.[1] === undefined) throw new Error('no OTP in Mailpit message');
  return match[1];
};

export const sendOtp = async (testApp: TestApp, email: string, ip = '10.0.0.1') => {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/api/v1/auth/send-otp',
    payload: { email },
    remoteAddress: ip,
  });
  return { res, nonce: res.statusCode === 200 ? json<{ nonce: string }>(res).nonce : '' };
};

export const verifyOtp = async (
  testApp: TestApp,
  email: string,
  nonce: string,
  otp: string,
  headers: Record<string, string> = {},
) =>
  testApp.app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-otp',
    payload: { email, nonce, otp },
    headers,
  });

/** Full customer login through the real routes; returns the issued session. */
export const loginCustomer = async (
  testApp: TestApp,
  email: string,
  headers: Record<string, string> = {},
): Promise<IssuedSession> => {
  const { nonce } = await sendOtp(testApp, email);
  const res = await verifyOtp(testApp, email, nonce, await readOtp(testApp, email), headers);
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return json<IssuedSession>(res);
};

export const startAdminLogin = async (testApp: TestApp, email: string): Promise<MfaChallenge> => {
  const { nonce } = await sendOtp(testApp, email);
  const res = await verifyOtp(testApp, email, nonce, await readOtp(testApp, email));
  if (res.statusCode !== 200) throw new Error(`admin otp failed: ${res.body}`);
  return json<MfaChallenge>(res);
};

export const enrolMfa = async (testApp: TestApp, mfaToken: string) => {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/enrol',
    headers: { authorization: `Bearer ${mfaToken}` },
  });
  if (res.statusCode !== 200) throw new Error(`enrol failed: ${res.body}`);
  return json<{ secret: string; otpauthUrl: string; qrDataUrl: string; recoveryCodes: string[] }>(
    res,
  );
};

export const verifyMfa = async (testApp: TestApp, mfaToken: string, code: string) =>
  testApp.app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/verify',
    headers: { authorization: `Bearer ${mfaToken}` },
    payload: { code },
  });

export interface AdminLoginOptions {
  readonly secret?: string;
  /** Must match the app clock when the test app was built with an injected `now`. */
  readonly at?: Date;
}

/** Enrols (if needed) and completes MFA for a seeded admin; returns the admin session and the TOTP secret. */
export const loginAdmin = async (
  testApp: TestApp,
  email: string,
  options: AdminLoginOptions = {},
) => {
  const challenge = await startAdminLogin(testApp, email);
  const secret =
    challenge.mfaEnrolmentRequired === true
      ? (await enrolMfa(testApp, challenge.mfaToken)).secret
      : options.secret;
  if (secret === undefined) throw new Error('admin already enrolled and no secret provided');
  const res = await verifyMfa(testApp, challenge.mfaToken, totpCode(secret, options.at));
  if (res.statusCode !== 200) throw new Error(`mfa verify failed: ${res.body}`);
  return { session: json<IssuedSession>(res), secret };
};

export const totpCode = (secret: string, at: Date = new Date()): string =>
  authenticator.clone({ epoch: at.getTime() }).generate(secret);

export const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

export const resetValkey = async (testApp: TestApp): Promise<void> => {
  await testApp.valkey.flushdb();
};
