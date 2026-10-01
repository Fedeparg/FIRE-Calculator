# Sextante

Personal-finance and FIRE calculators built around the Spanish tax system, plus an
aggregated portfolio that your own AI assistant can read and write over MCP.

**[sextante.fpardo.net](https://sextante.fpardo.net)** (Spanish, default) ·
[English](https://sextante.fpardo.net/en)

> **Not financial advice.** Sextante computes and explains; it never recommends.
> Every result is an estimate: check anything that matters with a professional and
> with the AEAT.

## What it is

- **27 calculators**: compound interest, FIRE (with a Monte Carlo simulator over
  real market history), mortgages, deposits, dividends, DCA, inflation, budget...
  All run in the browser, no account needed, and every input lives in the URL.
- **Spanish tax engine** (`packages/core/src/fiscal/`): IRPF by the AEAT dual-scale
  method with the regional scale of each common-regime community, Social Security,
  payroll withholding, self-employed, wealth tax, gift tax, capital gains (FIFO).
- **Aggregated portfolio** (needs sign-in): positions and lots across brokers,
  prices and FX, P&L, history, realised-gains report and progress towards a FIRE goal.
- **Remote MCP server** (`/api/mcp`, OAuth 2.1): the portfolio and every calculator
  (via `list_calculators` + `calculate`) for any MCP client.
- **Wiki** and legal pages in Markdown, bilingual (es/en) via `next-intl`.

## Architecture

A pnpm workspace with three packages that deploy as one stack:

| Path | What |
|---|---|
| `/` (root) | Next.js frontend (App Router) and BFF: `rewrites()` proxy `/api/*` and the OAuth routes to the API, so the browser only ever talks to one origin |
| `apps/api` | NestJS + Drizzle + PostgreSQL. Single source of truth for data and identity |
| `packages/core` | `@sextante/core`: pure logic shared by both (calculators, projection engine, tax engine, FX, portfolio breakdown and goal) |

The calculators and the wiki work with the frontend alone; the API is needed for
sign-in, the portfolio and MCP.

## Running it locally

Requirements: Node 24 (see `.nvmrc`; 22.13 is the minimum), [pnpm](https://pnpm.io/)
and Docker (for the API stack and the backend tests).

```bash
pnpm install
cp .env.example .env                     # frontend
pnpm dev                                 # http://localhost:3000

# Optional, for sign-in / portfolio / MCP:
cp apps/api/.env.example apps/api/.env
docker compose up -d --build             # postgres + one-shot migrate + api (:3001)
```

Day-to-day commands (each package is checked on its own; CI runs all of them):

| Frontend (root) | Backend |
|---|---|
| `pnpm typecheck` · `pnpm lint` | `pnpm --filter @sextante/api typecheck` · `lint` |
| `pnpm test` · `pnpm test <path>` | `pnpm --filter @sextante/api test` (needs Docker) |
| `pnpm build` | `pnpm --filter @sextante/api build` |

Backend details (modules, migrations, tests): [`apps/api/README.md`](apps/api/README.md).

## Deployment

Self-hosted with Docker Compose; a push to `main` runs CI and, only if it passes,
`.github/workflows/deploy.yml`. Setup, secrets, encrypted backups and analytics:
[`docs/DEPLOY.md`](docs/DEPLOY.md). Plans and decisions not to build things:
[`ROADMAP.md`](ROADMAP.md).

## License and security

Proprietary, all rights reserved. See [`LICENSE`](LICENSE). Versions published
before 2026-10-01 under the GNU AGPL-3.0 keep that licence.

Security issues: see [`SECURITY.md`](SECURITY.md).
