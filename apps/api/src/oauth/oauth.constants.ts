/**
 * Constantes del Authorization Server / Resource Server MCP.
 *
 * Los scopes son la unidad de permiso que el usuario concede a un cliente LLM:
 * lectura y escritura de la cartera. Mantenerlos mínimos (principio de menor
 * privilegio): una tool de escritura con un token solo-lectura recibe
 * `403 insufficient_scope` (step-up). Ver `_local/mcp-integracion.md`.
 */
export const SCOPE_PORTFOLIO_READ = 'portfolio:read';
export const SCOPE_PORTFOLIO_WRITE = 'portfolio:write';

/** Scopes que anuncia el servidor (metadata) y máximo que puede pedir un cliente. */
export const SCOPES_SUPPORTED = [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE];

/** Validez del access token: 1 hora (el cliente renueva con el refresh token). */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

/** Validez del refresh token: 30 días. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Validez del código de autorización: 60 s (de un solo uso, ventana muy corta). */
export const AUTH_CODE_TTL_SECONDS = 60;
