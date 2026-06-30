# Sextante

Suite de calculadoras de libertad financiera (FIRE) y finanzas personales,
centrada en el **sistema bancario y fiscal español**, más un agregador de cartera
personal. Información y herramientas orientativas — **no es asesoramiento**.

- **Web:** calculadoras (interés compuesto, FIRE, hipoteca, IRPF, patrimonio…),
  wiki bilingüe ("Aprende") y cartera personal agregada.
- **Idiomas:** castellano (por defecto) e inglés (`/en`), vía `next-intl`.
- **Marca:** Sextante.

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend + BFF | Next.js 16 (App Router, TypeScript, Turbopack) · Tailwind 4 · Recharts |
| Backend / API | NestJS 11 · Drizzle ORM · PostgreSQL |
| i18n | next-intl (`messages/es.json`, `messages/en.json`) |
| Tests | Vitest (frontend `core/` y backend) |
| Auth | Magic link (JWT en cookie HttpOnly); la API es la única fuente de verdad |
| MCP | Servidor MCP remoto + OAuth 2.1 (el usuario trae su propio LLM) |

Es un **monorepo pnpm**: la raíz es el frontend Next.js; `apps/api` es el backend
NestJS (con su propio `package.json` y scripts). `apps` está excluido del tooling
de la raíz; cada paquete se chequea por separado.

## Requisitos

- Node.js ≥ 20 y [pnpm](https://pnpm.io/)
- Docker (para el stack completo y para los tests de integración del backend)

## Arranque rápido

```bash
pnpm install
cp .env.example .env                 # variables del frontend
cp apps/api/.env.example apps/api/.env  # variables del backend (si vas a usar la API)

# Frontend (puerto 3000)
pnpm dev

# Backend (puerto 3001), en otra terminal
pnpm --filter @sextante/api dev
```

El navegador siempre habla con el mismo origen: Next reescribe `/api/*` hacia la
API (BFF same-origin), así que no hay CORS en desarrollo.

### Stack completo con Docker

```bash
docker compose up   # postgres + migraciones + api
```

## Comandos

**Frontend (raíz):**

```bash
pnpm dev          # desarrollo (puerto 3000)
pnpm build        # build de producción
pnpm start        # servir el build
pnpm test         # Vitest (una pasada)
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
```

**Backend (`apps/api`):**

```bash
pnpm --filter @sextante/api dev        # desarrollo (puerto 3001)
pnpm --filter @sextante/api test       # Vitest (requiere Docker para Postgres efímero)
pnpm --filter @sextante/api typecheck
pnpm --filter @sextante/api lint
pnpm --filter @sextante/api db:generate  # nueva migración tras editar schema.ts
pnpm --filter @sextante/api db:migrate
```

> Los tests del backend levantan un PostgreSQL efímero con
> [Testcontainers](https://testcontainers.com/); necesitan un daemon de Docker en
> marcha (local o en CI).

## Estructura

```
src/                      Frontend Next.js
  app/[locale]/           Rutas (i18n con prefijo as-needed)
  core/                   Lógica pura (cálculos, fiscal, formato) — sin React, testeable
  components/             UI, gráficas y calculadoras
  lib/                    Helpers de servidor (sesión, SEO, JSON-LD)
content/                  Wiki y legal en Markdown (i18n por sufijo de fichero)
messages/                 Traducciones es/en (paridad de claves obligatoria)
apps/api/                 Backend NestJS (Drizzle + Postgres)
docs/                     Despliegue, nginx, etc.
```

## Calidad

Antes de dar algo por terminado, deja en verde en cada paquete que toques:

- Frontend: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- Backend: `pnpm --filter @sextante/api typecheck`, `lint` y `test`.

La CI (`.github/workflows/ci.yml`) ejecuta estos checks en cada push y pull
request. El despliegue continuo a producción vive en
`.github/workflows/deploy.yml` (runner self-hosted).

## Licencia

Proyecto privado. Todos los derechos reservados.
