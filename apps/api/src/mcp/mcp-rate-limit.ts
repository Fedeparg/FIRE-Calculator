import { createHash } from 'node:crypto';

import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

/** Ventana del límite. */
export const MCP_RATE_LIMIT_WINDOW_MS = 60_000;
/**
 * Peticiones permitidas por ventana e identidad. 120/min es holgado para un cliente LLM
 * normal (un turno de conversación son unas pocas tools) y acota el coste de un cliente
 * enloquecido o malicioso: cada petición MCP hace SELECT del token + INSERT de auditoría.
 */
export const MCP_RATE_LIMIT_MAX = 120;

/** Cabecera Authorization en forma "Bearer <token>" (el esquema es case-insensitive). */
const BEARER_RE = /^Bearer\s+(\S+)$/i;

/**
 * Clave de cubo del limitador. Preferimos la IDENTIDAD del token (hash SHA-256 del Bearer)
 * sobre la IP por dos motivos:
 *
 *  1. La IP no es de fiar hasta que `TRUST_PROXY_HOPS` esté bien ajustado en producción
 *     (ver `main.ts`): con un salto mal contado, TODOS los clientes compartirían cubo.
 *  2. El coste real que queremos acotar es por token (consultas a BD + auditoría), no por
 *     origen de red; varios clientes tras un NAT no deben penalizarse entre sí.
 *
 * Se hashea el token —nunca se usa en claro como clave— para no dejar credenciales vivas en
 * la memoria del proceso ni en trazas, igual que hacemos al persistirlos.
 *
 * Sin Bearer (petición de descubrimiento que acabará en 401) caemos a la IP, normalizada con
 * `ipKeyGenerator`: agrupa las IPv6 por subred /64, porque un mismo cliente puede rotar de
 * dirección dentro de su prefijo y burlar el límite trivialmente.
 *
 * Función pura para poder testearla sin levantar Express.
 */
export function mcpRateLimitKey(req: Request): string {
  const match = BEARER_RE.exec(req.headers.authorization ?? '');
  if (match) {
    return `token:${createHash('sha256').update(match[1]).digest('hex')}`;
  }
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

/**
 * Limitador del endpoint MCP. El `ThrottlerGuard` global de Nest NO cubre `/api/mcp`: ese
 * endpoint se monta como middleware sobre el Express subyacente (los guards de Nest solo
 * corren en controllers), así que sin esto un token válido podría hacer llamadas ilimitadas.
 *
 * El almacén es en memoria y por proceso: suficiente para un despliegue de una sola
 * instancia como el actual. Si algún día se escala horizontalmente habrá que pasar a un
 * store compartido (Redis), porque cada proceso llevaría su propia cuenta.
 */
export function createMcpRateLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: MCP_RATE_LIMIT_WINDOW_MS,
    limit: MCP_RATE_LIMIT_MAX,
    // Cabeceras `RateLimit-*` estándar; las `X-RateLimit-*` heredadas no aportan nada.
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: mcpRateLimitKey,
    // El cliente MCP habla JSON-RPC: un 429 con el HTML por defecto de Express lo dejaría
    // sin poder parsear el error. Mismo formato que el 405 de `mount-mcp.ts`.
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
