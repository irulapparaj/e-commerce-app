import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/**/index.ts',
        'src/types/**',
        'src/ports/adapters/s3-object-storage.ts',
        'src/ports/adapters/smtp-email.ts',
      ],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
