import { defineConfig } from 'vitest/config';

import { apiUnitCoverageExclude } from './apps/api/vitest.config';

export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/api', 'apps/web'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'packages/shared/src/**',
        'apps/api/src/**',
        'apps/web/lib/**',
        'apps/web/components/admin/**',
        'apps/web/components/ui/**',
        'apps/web/components/layout/**',
        'apps/web/lib/api/**',
        'apps/web/middleware.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.d.ts',
        ...apiUnitCoverageExclude.map((pattern) => `apps/api/${pattern}`),
        'apps/web/lib/auth/session.ts',
        'apps/web/lib/auth/client.ts',
        'apps/web/lib/admin/server.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        'packages/shared/src/money/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'packages/shared/src/tax/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'apps/web/components/ui/**': { lines: 85, branches: 85, functions: 85, statements: 85 },
        'apps/web/components/layout/**': { lines: 85, branches: 85, functions: 85, statements: 85 },
        'apps/web/lib/api/**': { lines: 85, branches: 85, functions: 85, statements: 85 },
      },
    },
  },
});
