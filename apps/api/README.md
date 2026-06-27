# @sextante/api

API de Sextante: **NestJS + Drizzle ORM + PostgreSQL**. Es la **fuente de verdad**
de datos e identidad. El frontend Next (raíz del repo) la consume vía `/api`
(same-origin: en dev por `rewrites()`, en prod por el reverse proxy).

## Requisitos

- Node 24 LTS, pnpm, Docker (para Postgres y/o la propia API).

## Arrancar en local (esqueleto actual)

Desde la **raíz del repo**:

```bash
# 1) Levanta Postgres (volumen persistente) + API en Docker.
docker compose up -d --build

# 2) Aplica las migraciones (drizzle-kit, contra el Postgres expuesto en :5432).
cd apps/api
cp .env.example .env        # primera vez
pnpm db:migrate

# 3) Comprueba que responde.
curl http://localhost:3001/api/health
# -> {"status":"ok","database":"up","timestamp":"..."}
```

El frontend en dev (`pnpm dev` en la raíz, puerto 3000) proxea `/api` a la API,
así que `http://localhost:3000/api/health` también responde (same-origin).

## Desarrollo de la API sin Docker

```bash
# Necesita un Postgres accesible en DATABASE_URL (p. ej. el del compose).
cd apps/api
pnpm dev          # nest start --watch (hot reload)
```

## Migraciones (Drizzle)

El esquema vive en `src/db/schema.ts` (única fuente de verdad).

```bash
pnpm db:generate  # genera SQL en ./drizzle a partir del esquema
pnpm db:migrate   # aplica las migraciones pendientes
pnpm db:studio    # explorador visual de la BD
```

## Scripts

- `pnpm dev` · `pnpm build` · `pnpm start`
- `pnpm typecheck` · `pnpm lint`
- `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:studio`

## Estructura

- `src/main.ts` — bootstrap (prefijo global `/api`, shutdown hooks).
- `src/app.module.ts` — módulo raíz.
- `src/db/` — Drizzle: `schema.ts` (tablas) y `database.module.ts` (proveedor `DRIZZLE`).
- `src/health/` — endpoint `/api/health` (comprueba la conexión a Postgres).
- `drizzle/` — migraciones SQL versionadas.
