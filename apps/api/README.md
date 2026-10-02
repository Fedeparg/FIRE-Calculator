# @sextante/api

API de Sextante: **NestJS + Drizzle ORM + PostgreSQL**. Es la fuente de verdad de
datos e identidad. El frontend Next (raíz del repo) la consume vía `/api`
(same-origin: en dev por `rewrites()`, en prod por el reverse proxy).

Guía para trabajar en el código (tests con Docker, migraciones, gotchas):
`apps/api/CLAUDE.md`. Despliegue, secrets y email (Resend): [`docs/DEPLOY.md`](../../docs/DEPLOY.md).

## Arrancar en local

Requisitos: Node 24 (`.nvmrc`; mínimo 22.13), pnpm y Docker. Desde la **raíz**:

```bash
cp apps/api/.env.example apps/api/.env   # primera vez
docker compose up -d --build             # postgres + migrate (one-shot) + api
curl http://localhost:3001/api/health    # {"status":"ok","database":"up",...}
```

El servicio `migrate` aplica las migraciones al arrancar. El frontend (`pnpm dev`,
puerto 3000) proxea `/api` a la API, así que `http://localhost:3000/api/health`
también responde.

Para desarrollar la API con hot reload (necesita el Postgres del compose en
`DATABASE_URL`): `pnpm --filter @sextante/api dev`.

## Scripts

Se lanzan con `pnpm --filter @sextante/api <script>` desde la raíz.

- `dev` · `build` · `start`
- `test` (Vitest; levanta un Postgres efímero con Testcontainers, necesita Docker)
- `typecheck` · `lint`
- `db:generate` (SQL en `drizzle/` a partir de `src/db/schema.ts`) · `db:migrate` · `db:studio`

## Estructura

| Ruta | Qué hay |
|---|---|
| `src/main.ts` | Bootstrap: prefijo global `/api`, `trust proxy`, shutdown hooks y montaje del router OAuth/MCP en la raíz. |
| `src/app.module.ts` | Módulo raíz (config, throttler, scheduler). |
| `src/db/` | Drizzle: `schema.ts` (única fuente de verdad), `database.module.ts` (proveedor `DRIZZLE`) y `migrate.ts` (migrador del servicio one-shot). |
| `src/auth/` | Magic link: token hasheado SHA-256, canje atómico single-use, JWT en cookie HttpOnly. |
| `src/email/` | Transporte de correo: `dev` (log) o Resend, según `EMAIL_TRANSPORT`. |
| `src/positions/` | CRUD de posiciones y de sus lotes (compras/ventas). `lot-aggregate.ts` deriva cantidad y precio medio de los lotes con aritmética decimal exacta. |
| `src/income/` | Cobros que tributan como rendimientos del capital mobiliario (dividendos, intereses y recompensas del bróker): CRUD en `/api/income` y alta idempotente desde la importación. |
| `src/tax-return/` | Informe de la base del ahorro para la Renta: saldos negativos pendientes de años anteriores (`/api/tax-return/pending-balances`) y `GET /api/tax-return/:year`, que monta en el servidor ventas, cobros y compensaciones con las funciones de `@sextante/core/fiscal` (`TaxReturnService`, también tras la tool MCP `get_tax_return_report`). |
| `src/imports/` | Importación de operaciones desde un bróker (hoy Trade Republic): `preview` (plan sin escribir) y `confirm` (una transacción por posición, idempotente por `position_lots.external_id`). El parser vive en `@sextante/core/imports`. |
| `src/prices/` | Feed de cotizaciones y tasas FX; resolución ISIN/ticker → símbolo (OpenFIGI); histórico anual al dar de alta un símbolo. |
| `src/fx-reference/` | Tipos de cambio de referencia del BCE para la fiscalidad (`GET /api/fx/reference-rates`): se descargan por tramos bajo demanda y se guardan para siempre en `fx_reference_rates`. |
| `src/portfolio/` | Valoración y P&L de la cartera (`valuation.ts`) e histórico diario de valoración (`portfolio-snapshots.service.ts`). |
| `src/scenarios/` | Escenarios guardados de calculadora (jsonb acotado en tamaño y cantidad). |
| `src/notifications/` | Avisos por email al cruzar el 25/50/75/100 % del objetivo FIRE, con baja en un clic. |
| `src/jobs/` | Crons: refresco nocturno de precios → captura de snapshots, y refresco de precios intradía. |
| `src/oauth/` | Authorization Server OAuth 2.1 del MCP: clientes, grants, códigos, tokens y reaper. |
| `src/mcp/` | Servidor MCP remoto (Streamable HTTP): 21 tools de cartera y las 2 genéricas de calculadoras, `list_calculators` + `calculate` (`mcp.service.ts`), el registro de calculadoras con sus esquemas zod (`calculator-tools.ts`) y el log de auditoría. |
| `src/account/` | Cuenta del usuario: apps conectadas, export y borrado (RGPD). |
| `src/donations/` | Sesión de Stripe Checkout para las donaciones. |
| `src/health/` | `/api/health` (comprueba la conexión a Postgres). |
| `drizzle/` | Migraciones SQL versionadas (generadas con `db:generate`). |
