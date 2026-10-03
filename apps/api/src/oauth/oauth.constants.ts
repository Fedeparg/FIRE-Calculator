/** Scopes the user grants to an LLM client. Minimal: a write tool with a read-only token gets `403 insufficient_scope` (step-up). */
export const SCOPE_PORTFOLIO_READ = 'portfolio:read';
export const SCOPE_PORTFOLIO_WRITE = 'portfolio:write';

/** Scopes the server advertises (metadata) and the most a client can request. */
export const SCOPES_SUPPORTED = [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE];

/**
 * `portfolio:write` IMPLIES `portfolio:read`: changing the portfolio without being able to see it
 * has no real use, and the write tools already return the position they touch. The rule applies at
 * issuance (what the client requests, and what the user sees on the consent screen) and when
 * verifying each token (those issued before this rule), so the token, the screen and the per-tool
 * check (`ToolRunner`) always agree. Preserves order and does not duplicate.
 */
export function withImpliedScopes(scopes: readonly string[]): string[] {
  const unique = Array.from(new Set(scopes));
  if (unique.includes(SCOPE_PORTFOLIO_WRITE) && !unique.includes(SCOPE_PORTFOLIO_READ)) {
    return [SCOPE_PORTFOLIO_READ, ...unique];
  }
  return unique;
}

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Authorization code: 60 s, single use. */
export const AUTH_CODE_TTL_SECONDS = 60;
