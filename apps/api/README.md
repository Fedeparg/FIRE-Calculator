# @sextante/api

API de Sextante: **NestJS + Drizzle ORM + PostgreSQL**. Es la **fuente de verdad**
de datos e identidad. El frontend Next (raíz del repo) la consume vía `/api`
(same-origin: en dev por `rewrites()`, en prod por el reverse proxy).

## Requisitos

- Node 24 (ver `.nvmrc`; mínimo 22.13), pnpm, Docker (para Postgres y/o la propia API).

## Arrancar en local

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

## Email (Resend)

El login es **passwordless**: la API genera un _magic link_ y lo envía por email.
Hay dos transportes, seleccionados por `EMAIL_TRANSPORT`:

- `dev` (por defecto): **no envía nada**, escribe el enlace en el log. Útil en local.
- `resend`: envío real vía [Resend](https://resend.com). Para producción.

### Activar el transporte en producción

En el `.env` del servidor (nunca en el repo):

```bash
EMAIL_TRANSPORT=resend
RESEND_API_KEY=re_...                            # Resend -> Settings -> API Keys
EMAIL_FROM=Sextante <no-reply@send.tu-dominio>   # remitente verificado en Resend
```

`EMAIL_FROM` es **obligatorio** y no tiene valor por defecto: el remitente depende del
dominio verificado en tu cuenta de Resend, así que no hay ninguno razonable de fábrica.

Si `EMAIL_TRANSPORT=resend` y falta `RESEND_API_KEY` o `EMAIL_FROM`, **la API falla al
arrancar** con un error claro (preferimos un fallo ruidoso a enviar a un agujero negro).

### Verificar el dominio de envío (DNS)

Conviene enviar desde un **subdominio dedicado** (`send.<tu-dominio>`) y no desde
el dominio raíz, para aislar la reputación de envío del correo personal o
corporativo.

1. Crea una cuenta en Resend y, en **Domains -> Add Domain**, añade
   `send.<tu-dominio>`.
2. Resend mostrará un conjunto de **registros DNS concretos para tu dominio**.
   Cópialos **tal cual** (los valores exactos —en especial la clave DKIM— los genera
   Resend y varían por dominio y región; **no los inventes**) en el panel DNS de tu
   dominio (donde tengas la zona: Hetzner, Cloudflare, registrador…).
3. Espera a que Resend marque el dominio como **Verified** (la propagación DNS puede
   tardar de minutos a unas horas).

Los registros que Resend pedirá son, típicamente:

| Tipo | Host (ejemplo) | Para qué sirve |
|---|---|---|
| **MX** | `send.<tu-dominio>` | Return-Path / gestión de rebotes del subdominio de envío. Necesario para verificar; usa el destino y prioridad que indique Resend. |
| **TXT (SPF)** | `send.<tu-dominio>` | Autoriza a los servidores de Resend a enviar en nombre del dominio (`v=spf1 include:…`). |
| **TXT (DKIM)** | `resend._domainkey.send.<tu-dominio>` (o el host que indique Resend) | Firma criptográfica que prueba que el correo no se ha manipulado. Es la clave pública que genera Resend. |
| **TXT (DMARC)** _(recomendado)_ | `_dmarc.send.<tu-dominio>` | Política sobre qué hacer con correo que falle SPF/DKIM y a dónde mandar informes. Empieza laxo, p. ej. `v=DMARC1; p=none; rua=mailto:tu@correo`. |

> Los valores **exactos** (destino MX, cadena SPF, clave DKIM) son los que muestra
> Resend al añadir el dominio. Esta tabla solo explica **qué es cada registro y dónde
> va**; copia siempre los de tu panel de Resend.

Comprueba el flujo completo en prod pidiendo un magic link a tu propia dirección: el
correo debe llegar desde `no-reply@send.<tu-dominio>` con el botón **Entrar en Sextante**.

## Scripts

- `pnpm dev` · `pnpm build` · `pnpm start`
- `pnpm test` (Vitest; levanta un Postgres efímero con Testcontainers → necesita Docker)
- `pnpm typecheck` · `pnpm lint`
- `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:studio`

## Modelo de datos de la cartera

`positions` es la **foto** (cantidad y precio medio actuales) y `position_lots` la
**película** (cada compra y venta con su fecha). La foto NO se sustituye: se
**recalcula** desde los lotes en cada mutación, dentro de la misma transacción, así
que la valoración, las tools MCP y la UI —que leen `positions`— siguen funcionando
igual. La agregación es **coste medio móvil**: una venta baja la cantidad y no mueve
el precio medio. Todo el cálculo se hace con aritmética decimal exacta sobre los
`string` de `numeric` (`src/positions/lot-aggregate.ts`), nunca con `number`.

`portfolio_snapshots` guarda una fila por usuario y día con la valoración en **EUR**
(divisa base canónica) y las **tasas FX de ese día** en `jsonb`, lo que permite
reexpresar el histórico en cualquier divisa soportada sin recalcularlo.

## Tools MCP

12 tools, cada una con su scope. Las de escritura exigen `portfolio:write` en tiempo
de ejecución (step-up por tool, no un 403 HTTP) y todas quedan en `mcp_audit_log`.

| Tool | Scope | Qué hace |
|---|---|---|
| `list_positions` | `portfolio:read` | Todas las posiciones del usuario. |
| `get_portfolio_valuation` | `portfolio:read` | Valor de mercado y P&L, agregado en la divisa elegida. |
| `get_position` | `portfolio:read` | Detalle y P&L de una posición. |
| `search_instruments` | `portfolio:read` | Busca el símbolo exacto de un instrumento (mismo buscador que el alta en la UI), para que el LLM no invente tickers. |
| `get_portfolio_history` | `portfolio:read` | Serie diaria de valoración (snapshots), reexpresada a la divisa pedida. |
| `list_position_lots` | `portfolio:read` | Compras y ventas de una posición, en orden cronológico. |
| `add_position` | `portfolio:write` | Crea una posición. |
| `update_position` | `portfolio:write` | Edita una posición. |
| `combine_position` | `portfolio:write` | Suma una compra a una posición existente. |
| `delete_position` | `portfolio:write` | Borra una posición. |
| `add_position_lot` | `portfolio:write` | Registra una compra o venta con fecha y recalcula la posición. |
| `delete_position_lot` | `portfolio:write` | Borra una operación registrada y recalcula la posición. |

## Estructura

| Ruta | Qué hay |
|---|---|
| `src/main.ts` | Bootstrap: prefijo global `/api`, `trust proxy`, shutdown hooks y montaje del router OAuth/MCP en la raíz. |
| `src/app.module.ts` | Módulo raíz (config, throttler, scheduler). |
| `src/db/` | Drizzle: `schema.ts` (única fuente de verdad), `database.module.ts` (proveedor `DRIZZLE`) y `migrate.ts` (migrador del servicio one-shot). |
| `src/auth/` | Magic link: token hasheado SHA-256, canje atómico single-use, JWT en cookie HttpOnly. |
| `src/email/` | Transporte de correo: `dev` (log) o Resend, según `EMAIL_TRANSPORT`. |
| `src/positions/` | CRUD de posiciones y de sus **lotes** (compras/ventas). `lot-aggregate.ts` deriva cantidad y precio medio de los lotes con aritmética decimal exacta. |
| `src/prices/` | Feed de cotizaciones y tasas FX; resolución ISIN/ticker → símbolo (OpenFIGI); histórico anual al dar de alta un símbolo. |
| `src/portfolio/` | Valoración y P&L de la cartera (`valuation.ts`) e **histórico diario** de valoración (`portfolio-snapshots.service.ts`). |
| `src/scenarios/` | Escenarios guardados de calculadora (jsonb acotado en tamaño y cantidad). |
| `src/jobs/` | Cron nocturno: refresco de precios → captura de snapshots, en ese orden. |
| `src/oauth/` | Authorization Server OAuth 2.1 del MCP: clientes, grants, códigos, tokens y reaper. |
| `src/mcp/` | Servidor MCP remoto (Streamable HTTP), sus 12 tools y el log de auditoría. |
| `src/account/` | Cuenta del usuario: apps conectadas, export y borrado (RGPD). |
| `src/donations/` | Sesión de Stripe Checkout para las donaciones. |
| `src/health/` | `/api/health` (comprueba la conexión a Postgres). |
| `drizzle/` | Migraciones SQL versionadas (generadas con `db:generate`). |
