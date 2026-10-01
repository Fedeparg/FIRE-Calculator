/** Scopes que el usuario concede a un cliente LLM. Mínimos: una tool de escritura con token solo-lectura recibe `403 insufficient_scope` (step-up). */
export const SCOPE_PORTFOLIO_READ = 'portfolio:read';
export const SCOPE_PORTFOLIO_WRITE = 'portfolio:write';

/** Scopes que anuncia el servidor (metadata) y máximo que puede pedir un cliente. */
export const SCOPES_SUPPORTED = [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE];

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Código de autorización: 60 s, de un solo uso. */
export const AUTH_CODE_TTL_SECONDS = 60;
