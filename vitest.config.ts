import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/api', 'apps/web'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['packages/shared/src/**', 'apps/api/src/**', 'apps/web/lib/**'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/index.ts', 'apps/api/src/server.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        'packages/shared/src/money/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'packages/shared/src/tax/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
      },
    },
  },
});
