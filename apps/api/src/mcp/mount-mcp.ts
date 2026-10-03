import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { SCOPES_SUPPORTED } from '../oauth/oauth.constants.js';
import { OAuthUrls } from '../oauth/oauth-urls.js';
import { SextanteOAuthProvider } from '../oauth/oauth.provider.js';
import {
  createMcpIpRateLimiter,
  createMcpTokenRateLimiter,
  MCP_IP_RATE_LIMIT_MAX,
  MCP_TOKEN_RATE_LIMIT_MAX,
} from './mcp-rate-limit.js';
import { McpService } from './mcp.service.js';

/**
 * Mounts the OAuth Authorization Server (endpoints at the ROOT, outside the `/api` prefix) and the
 * MCP endpoint `/api/mcp` (Streamable HTTP protected by Bearer). It is done here, on the underlying
 * Express, because `mcpAuthRouter` must hang from the root (`/authorize`, `/token`, `/register`,
 * `/revoke`, `/.well-known/...`); Nest's global prefix only affects controllers, not this
 * middleware. See `_local/mcp-integracion.md`.
 *
 * Must be called after `app.use(cookieParser())` (the provider reads the session cookie on
 * `/authorize`) and before `app.listen()`.
 */
export function mountMcp(app: NestExpressApplication): void {
  const logger = new Logger('MCP');
  const provider = app.get(SextanteOAuthProvider);
  const urls = app.get(OAuthUrls);
  const mcp = app.get(McpService);
  const server_ = app.getHttpAdapter().getInstance();

  // OAuth 2.1 + discovery + PRM endpoints, at the root.
  server_.use(
    mcpAuthRouter({
      provider,
      issuerUrl: urls.issuer,
      resourceServerUrl: urls.resource,
      scopesSupported: SCOPES_SUPPORTED,
      resourceName: 'Sextante',
    }),
  );

  // Protected Resource Metadata URL for the 401's WWW-Authenticate challenge.
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(urls.resource);
  const bearer = requireBearerAuth({
    verifier: provider,
    // The minimum scope is enforced per tool (read/write); a valid token is enough here.
    requiredScopes: [],
    resourceMetadataUrl,
  });

  // CORS for the MCP endpoint. The SDK's OAuth router already sets CORS on /authorize|token|
  // register|.well-known, but we mount /api/mcp by hand, and without this a browser client
  // (MCP Inspector, web connectors) can neither read the discovery 401 (it needs to see
  // WWW-Authenticate) nor preflight the POST. Mounted before the bearer so the 401 itself
  // carries the CORS headers.
  server_.use('/api/mcp', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-Id',
    );
    res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Two-step rate limit for the MCP endpoint (see `mcp-rate-limit.ts`). The IP one goes after
  // CORS (so the 429 carries its headers and a browser client can read it) and before the
  // handlers, including the bearer and the 405s: registration order is execution order in
  // Express, so mounting it last would leave routes unlimited. The token one sits on the POST
  // route, behind the bearer, to count by already verified identity.
  server_.use('/api/mcp', createMcpIpRateLimiter());
  const tokenRateLimiter = createMcpTokenRateLimiter();

  // Stateless server: there is no server→client SSE stream nor session to close. After
  // initialize, clients open a GET for the stream; we answer 405 (not 404) so they know the
  // endpoint exists and stay in POST-only mode instead of assuming there is no MCP.
  const methodNotAllowed = (_req: Request, res: Response): void => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. El servidor MCP es sin estado (solo POST).' },
      id: null,
    });
  };
  server_.get('/api/mcp', methodNotAllowed);
  server_.delete('/api/mcp', methodNotAllowed);

  // MCP endpoint (Streamable HTTP, stateless: one transport per request).
  server_.post('/api/mcp', bearer, tokenRateLimiter, async (req: Request, res: Response) => {
    const auth = req.auth;
    const userId = auth?.extra && typeof auth.extra.userId === 'string' ? auth.extra.userId : undefined;
    if (!auth || !userId) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    const server = mcp.createServer({
      userId,
      clientId: auth.clientId,
      scopes: auth.scopes,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error(`Error handling MCP request: ${String(error)}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_server_error' });
      }
    }
  });

  logger.log(
    `MCP server mounted at ${urls.resource.href} (limit: ${MCP_TOKEN_RATE_LIMIT_MAX} req/min per token, ` +
      `${MCP_IP_RATE_LIMIT_MAX} per IP)`,
  );
}
