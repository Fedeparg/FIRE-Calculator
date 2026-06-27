# Imagen de la API (NestJS). Node 24 LTS (no usamos versiones impares/non-LTS).
# Multi-etapa: build (compila + genera un paquete desplegable autocontenido con
# `pnpm deploy`) -> runtime delgado.

# ---- Base común ----
FROM node:24-slim AS base
ENV CI=true
RUN corepack enable
WORKDIR /app

# ---- Build ----
FROM base AS build
# Manifiestos primero (cachea la instalación).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @sextante/api...

# Código y compilación a dist.
COPY apps/api ./apps/api
RUN pnpm --filter @sextante/api build

# `pnpm deploy` copia el paquete (incluido dist) + un node_modules AUTOCONTENIDO
# (sin symlinks al store de la raíz) en /app/deploy.
RUN pnpm --filter @sextante/api deploy --prod --legacy /app/deploy

# ---- Runtime ----
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/deploy ./

EXPOSE 3001
CMD ["node", "dist/main.js"]
