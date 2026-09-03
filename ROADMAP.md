# Roadmap

Where Sextante is today, what's next, and what it deliberately won't do.

> The original phase-by-phase planning document is kept out of the public repo —
> it described a project shape (and a monetization plan) that no longer matches
> what shipped.

## Shipped

| Area | Status |
|---|---|
| **26 calculators** — investing, FIRE, mortgages, savings, Spanish tax, debt | ✅ All live |
| **Spanish tax engine** — IRPF (dual-scale AEAT approximation) with **per-region scales for the 15 common-regime communities**, Social Security, wealth tax, gift tax, self-employed | ✅ Live, unit-tested |
| **Bilingual UI** — Spanish (default) + English via `next-intl`, 1,065 keys per locale, parity enforced by test | ✅ Live |
| **Wiki** — 30 articles + 26 calculator explainers, Markdown-driven, both locales | ✅ Live |
| **Passwordless auth** — magic link, SHA-256 hashed single-use tokens, JWT in an HttpOnly cookie | ✅ Live |
| **Portfolio** — aggregated positions across brokers, daily price feed, FX conversion, P&L | ✅ Live |
| **Portfolio history** — purchase lots per position, one year of prices fetched on first sight, nightly valuation snapshots, evolution chart and breakdown by asset / broker / currency | ✅ Live |
| **Capital-gains simulator** — FIFO lot matching with fees prorated, savings-scale estimate, explicit about what it does not model | ✅ Live |
| **Shareable calculations** — every input in the URL, copy-link button, and named scenarios saved to your account | ✅ Live |
| **Remote MCP server** — 12 tools over Streamable HTTP, OAuth 2.1, per-tool scope step-up, per-token rate limit | ✅ Live |
| **GDPR tooling** — data export, account deletion with cascade, connected-app revocation | ✅ Live |
| **SEO** — canonical URLs, hreflang, sitemap, JSON-LD, dynamic OG images | ✅ Live |
| **Ops** — CI-gated deploy, Dockerized rootless containers, encrypted off-site Postgres backups verified as restorable before upload | ✅ Live |
| **Accessibility** — labelled fields, keyboard- and touch-reachable tooltips, charts exposed as images with a screen-reader data table | ✅ Live |

## Next

- **More frequent price refresh** — currently one scheduled refresh per day, which
  is fine for long-term investors but visibly stale for active ones.
- **Regional deductions** — the regional IRPF *scales* are in, but the per-community
  deductions (rent, childcare, donations…) are not. Wealth tax and gift tax still ask
  for the rebate by hand on purpose: the first depends on the solidarity-tax bill and
  the second varies by band, so a single hardcoded percentage would be wrong.
- **Balearic and Riojan regional minimums** — both communities are live with their
  own scale, but fall back to the state personal minimum: the official table is
  ambiguous for over-65s in one case, and the other only raises a disability minimum
  the engine does not model yet.
- **Realised gains** — sales are simulated but not recorded as history, so there is
  no yearly realised-gain report yet.
- **Verify the proxy hop count in production** — `TRUST_PROXY_HOPS` defaults to 1;
  a diagnostic log on the magic-link route now prints the real forwarded chain so the
  value can be settled with evidence.

## Explicitly out of scope

- **Exposing the calculators over MCP.** The calculation engine lives in the
  frontend `core/` and runs in the user's browser, where anyone can audit it. The
  API can't import it, so exposing calculators over MCP would mean duplicating
  ~25 calculators plus the tax engine in the backend and letting the two drift.
  The cost is real and the gain isn't.
- **Bank account aggregation (PSD2 / open banking).** Licensing and cost put it
  out of reach for a free, self-hosted, single-maintainer project. Positions are
  entered manually or by an AI assistant over MCP.
- **Advertising.** Tried, removed. The project is funded by optional donations.
- **Personalized financial advice.** Sextante computes and explains; it does not
  recommend. Every page carries that disclaimer.
