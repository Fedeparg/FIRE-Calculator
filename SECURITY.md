# Security Policy

Sextante handles authentication, OAuth tokens and personal financial data, so
security reports are genuinely welcome.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting instead:
[**Report a vulnerability**](https://github.com/Fedeparg/sextante/security/advisories/new)
(Security → Advisories → Report a vulnerability).

I'll acknowledge within a few days. This is a single-maintainer side project, so
please don't expect enterprise response times — but anything affecting user data
or account takeover gets treated as urgent.

## Scope

In scope:

- Authentication and session handling (`apps/api/src/auth/`)
- The OAuth 2.1 authorization server and the MCP endpoint (`apps/api/src/oauth/`,
  `apps/api/src/mcp/`) — in particular anything that lets one user reach another
  user's positions
- Data access in the API (`apps/api/src/positions/`, `portfolio/`, `account/`)
- Security headers and CSP (`next.config.ts`)
- The deployment and backup tooling (`docker-compose.prod.yml`, `scripts/backup/`)

Out of scope:

- The **accuracy of financial or tax calculations**. Those are documented as
  approximations and explicitly not advice. Bugs there are ordinary issues —
  please do open a public issue, ideally with the expected figure and a source.
- Anything requiring physical or already-privileged access to the host.
- Missing hardening on the demo/dev Compose stack (`docker-compose.yml`), which
  ships intentionally weak defaults for local development.

## Known design decisions

These are deliberate, documented trade-offs rather than oversights:

- **`script-src` uses `'unsafe-inline'`** instead of a nonce. A nonce-based CSP
  would force per-request rendering and kill static generation / ISR for the
  calculators and the wiki. Reasoning is in `next.config.ts`.
- **The MCP write tools return a tool-level error rather than HTTP 403** when a
  read-only token calls them. All MCP tools share one endpoint, so the scope
  check has to be per-tool; the error prompts the client to reconnect with write
  permission.
