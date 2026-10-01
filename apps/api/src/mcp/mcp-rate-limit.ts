import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { sha256Hex } from '../common/crypto.js';

export const MCP_RATE_LIMIT_WINDOW_MS = 60_000;
/** 120/min es holgado para un cliente LLM normal y acota el coste de uno abusivo (cada petición hace SELECT del token + INSERT de auditoría). */
export const MCP_RATE_LIMIT_MAX = 120;

const BEARER_RE = /^Bearer\s+(\S+)$/i;

/**
 * Clave de cubo: la identidad del token (SHA-256 del Bearer) y no la IP, que no es fiable hasta
 * ajustar `TRUST_PROXY_HOPS` (con un salto mal contado todos compartirían cubo) y penalizaría a
 * clientes tras un NAT. Se hashea para no dejar credenciales en memoria ni en trazas.
 * Sin Bearer cae a la IP, con IPv6 agrupada por /64 (`ipKeyGenerator`) para que rotar de
 * dirección dentro del prefijo no burle el límite. Pura, testeable sin Express.
 */
export function mcpRateLimitKey(req: Request): string {
  const match = BEARER_RE.exec(req.headers.authorization ?? '');
  if (match) {
    return `token:${sha256Hex(match[1])}`;
  }
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

/**
 * Limitador del endpoint MCP. El `ThrottlerGuard` global no lo cubre: `/api/mcp` es middleware
 * de Express y los guards de Nest solo corren en controllers.
 * Almacén en memoria por proceso: vale con una instancia; al escalar habrá que usar Redis.
 */
export function createMcpRateLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: MCP_RATE_LIMIT_WINDOW_MS,
    limit: MCP_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: mcpRateLimitKey,
    // JSON-RPC como el 405 de `mount-mcp.ts`: el HTML por defecto no lo parsearía el cliente MCP.
    handler: (_req: Request, res: Response): void => {
      res.status(429).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Rate limit exceeded. Demasiadas peticiones MCP; inténtalo en un minuto.',
        },
        id: null,
      });
    },
  });
}
