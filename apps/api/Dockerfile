# syntax=docker/dockerfile:1
# API image (NestJS). Node 24 LTS (we do not use odd/non-LTS versions).
# Multi-stage: build (compiles + produces a self-contained deployable package with
# `pnpm deploy`) -> slim runtime.

# ---- Shared base ----
FROM node:24-slim AS base
ENV CI=true
RUN corepack enable
# pnpm store at a fixed path so it can be mounted as a BuildKit cache: that way
# `pnpm install` does not re-download the whole tree when the lockfile changes.
RUN pnpm config set store-dir /pnpm/store
WORKDIR /app

# ---- Build ----
FROM base AS build
# Manifests first (caches the install).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/core/package.json ./packages/core/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @sextante/api...

# Source and compilation to dist. The API build first compiles @sextante/core
# (logic shared with the frontend), whose `dist/` `pnpm deploy` then copies.
COPY packages/core ./packages/core
COPY apps/api ./apps/api
RUN pnpm --filter @sextante/api build

# `pnpm deploy` copies the package (including dist) + a SELF-CONTAINED node_modules
# (no symlinks to the root store) into /app/deploy.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @sextante/api deploy --prod --legacy /app/deploy

# `pnpm deploy` copies the WHOLE package, so it drags along sources, tests and tooling that the
# final image never runs (it only runs `dist/`). They are removed to reduce surface and size.
# `drizzle/` is KEPT on purpose: the one-shot `migrate` service (`node dist/db/migrate.js`)
# applies those .sql files at startup.
RUN rm -rf /app/deploy/src /app/deploy/test /app/deploy/vitest.config.ts \
    /app/deploy/eslint.config.mjs /app/deploy/nest-cli.json /app/deploy/tsconfig*.json \
    /app/deploy/*.tsbuildinfo /app/deploy/drizzle.config.ts

# ---- Runtime ----
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Unprivileged: the Node base image ships the `node` user (uid 1000). Running as root would
# give an RCE in the app full permissions inside the container (and over any mounted volume).
# `--chown` on the COPY avoids an extra `chown` layer that would duplicate files.
COPY --from=build --chown=node:node /app/deploy ./
USER node

EXPOSE 3001
CMD ["node", "dist/main.js"]
