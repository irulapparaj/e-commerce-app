import { defineConfig } from 'prisma/config';

// Prisma stops auto-loading .env once a config file exists; mirror the app's convention instead.
try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env in this checkout (CI, containers): DATABASE_URL comes from the environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
