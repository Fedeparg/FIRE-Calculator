/** Scopes que el usuario concede a un cliente LLM. Mínimos: una tool de escritura con token solo-lectura recibe `403 insufficient_scope` (step-up). */
export const SCOPE_PORTFOLIO_READ = 'portfolio:read';
export const SCOPE_PORTFOLIO_WRITE = 'portfolio:write';

/** Scopes que anuncia el servidor (metadata) y máximo que puede pedir un cliente. */
export const SCOPES_SUPPORTED = [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE];

/**
 * `portfolio:write` IMPLICA `portfolio:read`: modificar la cartera sin poder verla no tiene uso
 * real, y las tools de escritura ya devuelven la posición que tocan. La regla se aplica al
 * emitir (lo que pide el cliente, y lo que ve el usuario en la pantalla de consentimiento) y al
 * verificar cada token (los emitidos antes de esta regla), de modo que el token, la pantalla y
 * el control por tool (`ToolRunner`) dicen siempre lo mismo. Conserva el orden y no duplica.
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

/** Código de autorización: 60 s, de un solo uso. */
export const AUTH_CODE_TTL_SECONDS = 60;
