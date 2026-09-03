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

# `pnpm deploy` copia el paquete ENTERO, así que arrastra fuentes, tests y tooling que la
# imagen final no ejecuta (solo corre `dist/`). Se eliminan para reducir superficie y tamaño.
# `drizzle/` se CONSERVA a propósito: el servicio one-shot `migrate` (`node dist/db/migrate.js`)
# aplica esos .sql en el arranque.
RUN rm -rf /app/deploy/src /app/deploy/test /app/deploy/vitest.config.ts \
    /app/deploy/eslint.config.mjs /app/deploy/nest-cli.json /app/deploy/tsconfig*.json \
    /app/deploy/*.tsbuildinfo /app/deploy/drizzle.config.ts

# ---- Runtime ----
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Sin privilegios: la imagen base de Node trae el usuario `node` (uid 1000). Correr como
# root daría a un RCE en la app permisos totales dentro del contenedor (y sobre cualquier
# volumen montado). `--chown` en el COPY evita una capa extra de `chown` duplicando ficheros.
COPY --from=build --chown=node:node /app/deploy ./
USER node

EXPOSE 3001
CMD ["node", "dist/main.js"]
