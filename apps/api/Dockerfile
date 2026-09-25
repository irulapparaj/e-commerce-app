# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12.6.0
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @pe/api...
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @pe/api db:generate && pnpm --filter @pe/api build
RUN pnpm --filter @pe/api deploy --legacy --prod /out \
  && cp -r apps/api/dist /out/dist \
  && cd /out && pnpm exec prisma generate \
  && rm -rf /out/src /out/test /out/tsup.config.ts /out/vitest.config.ts /out/vitest.int.config.ts

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /out /app
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
# One-shot migration job (DESIGN §4.2): `node_modules/.bin/prisma migrate deploy && node dist/seed.js`
CMD ["node", "dist/server.js"]
