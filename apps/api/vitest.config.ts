import { defineConfig } from 'vitest/config';

/** Files whose behaviour is proven by the integration suite (vitest.int.config.ts) against real services. */
export const apiUnitCoverageExclude = [
  'src/**/*.test.ts',
  'src/server.ts',
  'src/**/index.ts',
  'src/types/**',
  'src/ports/adapters/s3-object-storage.ts',
  'src/ports/adapters/smtp-email.ts',
  'src/db/prisma.ts',
  'src/db/relations.ts',
  'src/db/scoping.ts',
  'src/db/encryption-extension.ts',
  'src/plugins/prisma.ts',
  'src/modules/inventory/apply-movement.ts',
  'src/plugins/auth.ts',
  'src/plugins/rate-limit.ts',
  'src/modules/auth/routes.ts',
  'src/modules/auth/session-routes.ts',
  'src/modules/auth/mfa-routes.ts',
  'src/modules/auth/login.service.ts',
  'src/modules/auth/otp.service.ts',
  'src/modules/auth/refresh.service.ts',
  'src/modules/auth/mfa.service.ts',
  'src/modules/auth/user-state.ts',
  'src/modules/auth/guards.ts',
  'src/modules/auth/security-events.ts',
  'src/modules/auth/emails.ts',
  'src/modules/staff/**',
];

export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: apiUnitCoverageExclude,
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
