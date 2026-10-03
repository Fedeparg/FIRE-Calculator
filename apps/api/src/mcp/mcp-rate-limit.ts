import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { sha256Hex } from '../common/crypto.js';

export const MCP_RATE_LIMIT_WINDOW_MS = 60_000;
/** 120/min per token is generous for a normal LLM client and bounds the cost of an abusive one (each request does a token SELECT + an audit INSERT). */
export const MCP_TOKEN_RATE_LIMIT_MAX = 120;
/**
 * 600/min per IP, BEFORE the token is verified: covers requests with an invalid Bearer, which the
 * per-token limit cannot count. Generous on purpose (several legitimate clients behind a NAT fit
 * easily), because the IP is not reliable until `TRUST_PROXY_HOPS` is tuned.
 */
export const MCP_IP_RATE_LIMIT_MAX = 600;

/** Per-IP key, with IPv6 grouped by /64 (`ipKeyGenerator`) so rotating addresses within the prefix does not dodge the limit. */
export function mcpIpRateLimitKey(req: Request): string {
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

/**
 * Key per ALREADY VERIFIED token (`req.auth`, filled in by the SDK's Bearer middleware). It does
 * not come from the header: with a random Bearer on each request, every one would open a new bucket
 * (and a token SELECT), and the limit would limit nothing. It is hashed so no credentials linger in
 * memory or traces. Without a verified token it falls back to the IP (should not happen: it runs
 * after the Bearer).
 */
export function mcpTokenRateLimitKey(req: Request): string {
  const token = req.auth?.token;
  return token ? `token:${sha256Hex(token)}` : mcpIpRateLimitKey(req);
}

/** 429 response in JSON-RPC, like the 405 in `mount-mcp.ts`: the MCP client would not parse the default HTML. */
function rateLimitExceeded(_req: Request, res: Response): void {
  res.status(429).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Rate limit exceeded. Too many MCP requests; try again in a minute.',
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
 * Chained limiters for the MCP endpoint: the IP one runs before the Bearer (it also counts invalid
 * tokens) and the token one after it (verified identity, tolerates NAT). The global
 * `ThrottlerGuard` does not cover them: `/api/mcp` is Express middleware and Nest guards only run
 * on controllers. In-memory store per process: fine with a single instance; scaling out will need
 * Redis. `limit` is only changed in tests.
 */
export function createMcpIpRateLimiter(limit: number = MCP_IP_RATE_LIMIT_MAX): RateLimitRequestHandler {
  return createLimiter(limit, mcpIpRateLimitKey);
}

export function createMcpTokenRateLimiter(limit: number = MCP_TOKEN_RATE_LIMIT_MAX): RateLimitRequestHandler {
  return createLimiter(limit, mcpTokenRateLimitKey);
}
