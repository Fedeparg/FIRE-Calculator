# @sextante/api

Sextante API: **NestJS + Drizzle ORM + PostgreSQL**. It is the source of truth for
data and identity. The Next frontend (repo root) consumes it through `/api`
(same-origin: via `rewrites()` in dev, via the reverse proxy in prod).

Guide to working on the code (tests with Docker, migrations, gotchas):
`apps/api/CLAUDE.md`. Deployment, secrets and email (Resend): [`docs/DEPLOY.md`](../../docs/DEPLOY.md).

## Running locally

Requirements: Node 24 (`.nvmrc`; 22.13 at least), pnpm and Docker. From the **root**:

```bash
cp apps/api/.env.example apps/api/.env   # first time
docker compose up -d --build             # postgres + migrate (one-shot) + api
curl http://localhost:3001/api/health    # {"status":"ok","database":"up",...}
```

The `migrate` service applies the migrations on startup. The frontend (`pnpm dev`,
port 3000) proxies `/api` to the API, so `http://localhost:3000/api/health`
responds as well.

To develop the API with hot reload (needs the compose Postgres in
`DATABASE_URL`): `pnpm --filter @sextante/api dev`.

## Scripts

Run them with `pnpm --filter @sextante/api <script>` from the root.

- `dev` · `build` · `start`
- `test` (Vitest; starts an ephemeral Postgres with Testcontainers, needs Docker)
- `typecheck` · `lint`
- `db:generate` (SQL in `drizzle/` from `src/db/schema.ts`) · `db:migrate` · `db:studio`

## Layout

| Path | Contents |
|---|---|
| `src/main.ts` | Bootstrap: global `/api` prefix, `trust proxy`, shutdown hooks and mounting of the OAuth/MCP router at the root. |
| `src/app.module.ts` | Root module (config, throttler, scheduler). |
| `src/db/` | Drizzle: `schema.ts` (single source of truth), `database.module.ts` (`DRIZZLE` provider) and `migrate.ts` (migrator for the one-shot service). |
| `src/auth/` | Magic link: SHA-256 hashed token, atomic single-use redemption, JWT in an HttpOnly cookie. |
| `src/email/` | Mail transport: `dev` (log) or Resend, depending on `EMAIL_TRANSPORT`. |
| `src/positions/` | CRUD for positions and their lots (buys/sells). `lot-aggregate.ts` derives quantity and average price from the lots with exact decimal arithmetic. |
| `src/income/` | Payments taxed as *rendimientos del capital mobiliario* (investment income: dividends, interest and broker rewards): CRUD at `/api/income` and idempotent creation from the import. |
| `src/tax-return/` | *Base del ahorro* (savings tax base) report for the income tax return: pending negative balances from previous years (`/api/tax-return/pending-balances`) and `GET /api/tax-return/:year`, which assembles sales, payments and offsets on the server with the `@sextante/core/fiscal` functions (`TaxReturnService`, also behind the MCP tool `get_tax_return_report`). |
| `src/imports/` | Import of trades from a broker (Trade Republic today): `preview` (plan without writing) and `confirm` (one transaction per position, idempotent by `position_lots.external_id`). The parser lives in `@sextante/core/imports`. |
| `src/prices/` | Quote and FX rate feed; ISIN/ticker → symbol resolution (OpenFIGI); yearly history when a symbol is added. |
| `src/fx-reference/` | ECB reference exchange rates for tax purposes (`GET /api/fx/reference-rates`): downloaded in ranges on demand and stored forever in `fx_reference_rates`. |
| `src/portfolio/` | Portfolio valuation and P&L (`valuation.ts`) and daily valuation history (`portfolio-snapshots.service.ts`). |
| `src/scenarios/` | Saved calculator scenarios (jsonb bounded in size and count). |
| `src/notifications/` | Email alerts when crossing 25/50/75/100 % of the FIRE target, with one-click unsubscribe. |
| `src/jobs/` | Crons: nightly price refresh → snapshot capture, intraday price refresh and pruning of expired data (`data-retention.ts`: tokens, magic links, MCP audit and abandoned DCR clients). |
| `src/oauth/` | OAuth 2.1 Authorization Server for MCP: clients, grants, codes and tokens. |
| `src/mcp/` | Remote MCP server (Streamable HTTP): 21 portfolio tools and the 2 generic calculator ones, `list_calculators` + `calculate` (`mcp.service.ts`), the calculator registry with its zod schemas (`calculator-tools.ts`) and the audit log. |
| `src/account/` | User account: connected apps, export and deletion (GDPR). |
| `src/donations/` | Stripe Checkout session for donations. |
| `src/health/` | `/api/health` (checks the Postgres connection). |
| `drizzle/` | Versioned SQL migrations (generated with `db:generate`). |
