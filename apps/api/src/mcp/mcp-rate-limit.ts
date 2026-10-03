import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { sha256Hex } from '../common/crypto.js';

export const MCP_RATE_LIMIT_WINDOW_MS = 60_000;
/** 120/min por token es holgado para un cliente LLM normal y acota el coste de uno abusivo (cada petición hace SELECT del token + INSERT de auditoría). */
export const MCP_TOKEN_RATE_LIMIT_MAX = 120;
/**
 * 600/min por IP, ANTES de verificar el token: cubre las peticiones con Bearer inválido, que el
 * límite por token no puede contar. Holgado a propósito (varios clientes legítimos tras un NAT
 * caben de sobra), porque la IP no es fiable hasta ajustar `TRUST_PROXY_HOPS`.
 */
export const MCP_IP_RATE_LIMIT_MAX = 600;

/** Clave por IP, con IPv6 agrupada por /64 (`ipKeyGenerator`) para que rotar de dirección dentro del prefijo no burle el límite. */
export function mcpIpRateLimitKey(req: Request): string {
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

/**
 * Clave por token YA VERIFICADO (`req.auth`, que rellena el middleware Bearer del SDK). No sale
 * de la cabecera: con un Bearer aleatorio en cada petición, cada una abriría un cubo nuevo (y un
 * SELECT del token), y el límite no limitaría nada. Se hashea para no dejar credenciales en
 * memoria ni en trazas. Sin token verificado cae a la IP (no debería pasar: va tras el Bearer).
 */
export function mcpTokenRateLimitKey(req: Request): string {
  const token = req.auth?.token;
  return token ? `token:${sha256Hex(token)}` : mcpIpRateLimitKey(req);
}

/** Respuesta 429 en JSON-RPC como el 405 de `mount-mcp.ts`: el HTML por defecto no lo parsearía el cliente MCP. */
function rateLimitExceeded(_req: Request, res: Response): void {
  res.status(429).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Rate limit exceeded. Demasiadas peticiones MCP; inténtalo en un minuto.',
    },
    id: null,
  });
}

function createLimiter(limit: number, keyGenerator: (req: Request) => string): RateLimitRequestHandler {
  return rateLimit({
    windowMs: MCP_RATE_LIMIT_WINDOW_MS,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitExceeded,
  });
}

/**
 * Limitadores del endpoint MCP, encadenados: el de IP va antes del Bearer (cuenta también los
 * tokens inválidos) y el de token después (identidad verificada, tolera NAT). El
 * `ThrottlerGuard` global no los cubre: `/api/mcp` es middleware de Express y los guards de Nest
 * solo corren en controllers. Almacén en memoria por proceso: vale con una instancia; al escalar
 * habrá que usar Redis. El `limit` solo se cambia en los tests.
 */
export function createMcpIpRateLimiter(limit: number = MCP_IP_RATE_LIMIT_MAX): RateLimitRequestHandler {
  return createLimiter(limit, mcpIpRateLimitKey);
}

export function createMcpTokenRateLimiter(limit: number = MCP_TOKEN_RATE_LIMIT_MAX): RateLimitRequestHandler {
  return createLimiter(limit, mcpTokenRateLimitKey);
}
