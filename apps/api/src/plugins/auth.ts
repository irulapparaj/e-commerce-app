import { sharedPlugin } from '../lib/plugin';
import { createGuards, type Guards } from '../modules/auth/guards';
import { createAuthHooks, type AuthHooks } from '../modules/auth/hooks';
import { createLoginService, type LoginService } from '../modules/auth/login.service';
import { createMfaService, type MfaService } from '../modules/auth/mfa.service';
import { createOtpService, type OtpService } from '../modules/auth/otp.service';
import { createRefreshService, type RefreshService } from '../modules/auth/refresh.service';
import { createSecurityEvents, type SecurityEvents } from '../modules/auth/security-events';
import { createTokenService, type TokenService } from '../modules/auth/token.service';
import { createUserStateCache, type UserStateCache } from '../modules/auth/user-state';

export interface AuthServices {
  readonly tokens: TokenService;
  readonly otp: OtpService;
  readonly refresh: RefreshService;
  readonly mfa: MfaService;
  readonly login: LoginService;
  readonly hooks: AuthHooks;
  readonly events: SecurityEvents;
  readonly userState: UserStateCache;
}

export interface AuthPluginOptions {
  /** Injectable clock so tests can drive idle/absolute expiry and step-up windows. */
  readonly now?: () => Date;
}

export const authPlugin = sharedPlugin<AuthPluginOptions>(async (app, options) => {
  const now = options.now ?? (() => new Date());
  const nowMs = () => now().getTime();
  const events = createSecurityEvents(app.log, app.metrics);
  const tokens = createTokenService({
    keys: app.env.JWT_KEYS_JSON,
    activeKid: app.env.JWT_ACTIVE_KID,
    issuer: app.env.JWT_ISSUER,
    now,
  });
  const hooks = createAuthHooks();
  const sendLimitOverrides: { perEmail?: number; perIp?: number } = {};
  if (app.env.OTP_EMAIL_RATE_LIMIT !== undefined)
    sendLimitOverrides.perEmail = app.env.OTP_EMAIL_RATE_LIMIT;
  if (app.env.OTP_IP_RATE_LIMIT !== undefined)
    sendLimitOverrides.perIp = app.env.OTP_IP_RATE_LIMIT;

  const otp = createOtpService({
    valkey: app.valkey,
    keys: app.ports.keys,
    email: app.ports.email,
    rateLimiter: app.rateLimiter,
    now: nowMs,
    sendLimitOverrides,
  });
  const refresh = createRefreshService({ prisma: app.prisma, tokens, hooks, events, now });
  const mfa = createMfaService({ prisma: app.prisma, keys: app.ports.keys, events, now });
  const login = createLoginService({ prisma: app.prisma, otp, refresh, mfa, tokens, events, now });
  const userState = createUserStateCache(app.prisma, nowMs);

  const services: AuthServices = { tokens, otp, refresh, mfa, login, hooks, events, userState };
  app.decorate('auth', services);
  const guards: Guards = createGuards(app, now);
  app.decorate('guards', guards);
});
