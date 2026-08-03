# Roadmap

Where Sextante is today, what's next, and what it deliberately won't do.

> The original phase-by-phase planning document is kept out of the public repo —
> it described a project shape (and a monetization plan) that no longer matches
> what shipped.

## Shipped

| Area | Status |
|---|---|
| **26 calculators** — investing, FIRE, mortgages, savings, Spanish tax, debt | ✅ All live |
| **Spanish tax engine** — IRPF (dual-scale AEAT approximation), Social Security, wealth tax, gift tax, self-employed | ✅ Live, unit-tested |
| **Bilingual UI** — Spanish (default) + English via `next-intl`, 909 keys per locale | ✅ Live |
| **Wiki** — 30 articles + 26 calculator explainers, Markdown-driven, both locales | ✅ Live |
| **Passwordless auth** — magic link, SHA-256 hashed single-use tokens, JWT in an HttpOnly cookie | ✅ Live |
| **Portfolio** — aggregated positions across brokers, daily price feed, FX conversion, P&L | ✅ Live |
| **Remote MCP server** — 7 tools over Streamable HTTP, OAuth 2.1, per-tool scope step-up | ✅ Live |
| **GDPR tooling** — data export, account deletion with cascade, connected-app revocation | ✅ Live |
| **SEO** — canonical URLs, hreflang, sitemap, JSON-LD, dynamic OG images | ✅ Live |
| **Ops** — CI gate, Dockerized deploy, encrypted off-site Postgres backups | ✅ Live |

## Next

- **Portfolio snapshots** — persist daily valuations so the portfolio gets a real
  history chart instead of only a point-in-time view.
- **More frequent price refresh** — currently one scheduled refresh per day, which
  is fine for long-term investors but visibly stale for active ones.
- **Wider Spanish tax coverage** — regional (autonomous community) IRPF scales and
  deductions. Today the engine assumes the supplementary state scale, which is an
  approximation the UI is explicit about.
- **Accessibility pass** — a full keyboard and screen-reader audit of the
  calculator forms and charts.

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
