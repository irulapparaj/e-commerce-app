import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api-int',
    environment: 'node',
    include: ['test/int/**/*.test.ts', 'test/security/**/*.test.ts'],
    globalSetup: ['test/helpers/containers.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
    teardownTimeout: 30_000,
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: './coverage-int',
      include: [
        'src/db/**',
        'src/modules/inventory/**',
        'src/modules/auth/**',
        'src/modules/staff/**',
        'src/modules/imports/**',
        'src/modules/exports/**',
        'src/modules/dpdp/**',
        'src/modules/customers/**',
        'src/modules/cart/**',
        'src/modules/orders/**',
        'src/modules/payments/**',
        'src/modules/tax/**',
        'src/plugins/auth.ts',
        'src/plugins/rate-limit.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/db/index.ts'],
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
