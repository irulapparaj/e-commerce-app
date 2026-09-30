import type { TestApp } from './app';
import { bearer, loginAdmin, totpCode } from './auth';
import { ADMIN_EMAIL, getPrisma } from './db';

export const STAFF_EMAIL = 'staff@example.test';

export interface AdminSession {
  readonly userId: string;
  readonly email: string;
  readonly role: 'ADMIN' | 'STAFF';
  readonly token: string;
  /** Access token carrying `amr: ["step-up"]` for the next five minutes. */
  readonly steppedToken: string;
  readonly refreshToken: string;
  readonly secret: string;
  readonly sessionId: string;
}

const stepUp = async (testApp: TestApp, token: string, secret: string): Promise<string> => {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/api/v1/auth/step-up',
    headers: bearer(token),
    payload: { code: totpCode(secret) },
  });
  if (res.statusCode !== 200) throw new Error(`step-up failed: ${res.body}`);
  return (JSON.parse(res.body) as { data: { accessToken: string } }).data.accessToken;
};

/** Logs a seeded/created admin-role user in through the real routes (enrolling MFA) and steps up. */
export const loginAdminUser = async (
  testApp: TestApp,
  email: string,
  knownSecret?: string,
): Promise<AdminSession> => {
  const { session, secret } = await loginAdmin(
    testApp,
    email,
    knownSecret === undefined ? {} : { secret: knownSecret },
  );
  const steppedToken = await stepUp(testApp, session.accessToken, secret);
  return {
    userId: session.user.id,
    email,
    role: session.user.role as 'ADMIN' | 'STAFF',
    token: session.accessToken,
    steppedToken,
    refreshToken: session.refreshToken,
    secret,
    sessionId: session.sessionId,
  };
};

/** Seeded admin plus a STAFF account created directly in the database, both signed in and stepped up. */
export const loginAdminAndStaff = async (
  testApp: TestApp,
  known: { readonly admin?: string; readonly staff?: string } = {},
): Promise<{ admin: AdminSession; staff: AdminSession }> => {
  await getPrisma().user.upsert({
    where: { email: STAFF_EMAIL },
    create: { email: STAFF_EMAIL, name: 'Staff Member', role: 'STAFF' },
    update: { role: 'STAFF', mfaEnabled: false, totpSecret: null, mfaRecoveryCodes: [] },
  });
  const admin = await loginAdminUser(testApp, ADMIN_EMAIL, known.admin);
  const staff = await loginAdminUser(testApp, STAFF_EMAIL, known.staff);
  return { admin, staff };
};

export type InjectResponse = Awaited<ReturnType<TestApp['app']['inject']>>;

export const adminInject = async (
  testApp: TestApp,
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object | string,
): Promise<InjectResponse> =>
  testApp.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: bearer(token),
    ...(payload === undefined ? {} : { payload }),
  });

export const body = <T>(res: {
  body: string;
}): {
  data: T;
  meta?: { page: number; limit: number; total: number };
  error: { code: string; message: string } | null;
} =>
  JSON.parse(res.body) as {
    data: T;
    meta?: { page: number; limit: number; total: number };
    error: { code: string; message: string } | null;
  };
