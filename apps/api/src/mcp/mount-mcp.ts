import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { SCOPES_SUPPORTED } from '../oauth/oauth.constants.js';
import { OAuthUrls } from '../oauth/oauth-urls.js';
import { SextanteOAuthProvider } from '../oauth/oauth.provider.js';
import { createMcpRateLimiter, MCP_RATE_LIMIT_MAX } from './mcp-rate-limit.js';
import { McpService } from './mcp.service.js';

/**
 * Monta el Authorization Server OAuth (endpoints en la RAÍZ, fuera del prefijo `/api`) y el
 * endpoint MCP `/api/mcp` (Streamable HTTP protegido por Bearer). Se hace aquí, sobre el
 * Express subyacente, porque `mcpAuthRouter` DEBE colgar de la raíz (`/authorize`, `/token`,
 * `/register`, `/revoke`, `/.well-known/...`); el prefijo global de Nest solo afecta a los
 * controllers, no a este middleware. Ver `_local/mcp-integracion.md`.
 *
 * Debe llamarse DESPUÉS de `app.use(cookieParser())` (el provider lee la cookie de sesión en
 * `/authorize`) y ANTES de `app.listen()`.
 */
export function mountMcp(app: NestExpressApplication): void {
  const logger = new Logger('MCP');
  const provider = app.get(SextanteOAuthProvider);
  const urls = app.get(OAuthUrls);
  const mcp = app.get(McpService);
  const server_ = app.getHttpAdapter().getInstance();

  // Endpoints OAuth 2.1 + discovery + PRM, en la raíz.
  server_.use(
    mcpAuthRouter({
      provider,
      issuerUrl: urls.issuer,
      resourceServerUrl: urls.resource,
      scopesSupported: SCOPES_SUPPORTED,
      resourceName: 'Sextante',
    }),
  );

  // URL de la Protected Resource Metadata para el reto WWW-Authenticate del 401.
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(urls.resource);
  const bearer = requireBearerAuth({
    verifier: provider,
    // El scope mínimo se exige por-tool (lectura/escritura); aquí basta un token válido.
    requiredScopes: [],
    resourceMetadataUrl,
  });

  // CORS para el endpoint MCP. El router OAuth del SDK ya pone CORS en /authorize|token|
  // register|.well-known, pero /api/mcp lo montamos a mano y SIN esto un cliente de
  // navegador (MCP Inspector, conectores web) no puede ni leer el 401 de descubrimiento
  // (necesita ver WWW-Authenticate) ni hacer el preflight del POST. Se monta ANTES del
  // bearer para que el propio 401 lleve las cabeceras CORS.
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

  // Rate limit del endpoint MCP. Va DESPUÉS del CORS (para que el 429 lleve sus cabeceras y
  // un cliente de navegador pueda leerlo) y ANTES de los handlers, incluidos el bearer y los
  // 405: el orden de registro es el orden de ejecución en Express, así que montarlo al final
  // dejaría rutas sin limitar. Ver `mcp-rate-limit.ts` para la elección de clave.
  server_.use('/api/mcp', createMcpRateLimiter());

  // Servidor sin estado: no hay stream SSE servidor→cliente ni sesión que cerrar. Tras el
  // initialize, los clientes abren un GET para el stream; respondemos 405 (NO 404) para que
  // sepan que el endpoint existe y sigan en modo solo-POST en vez de creer que no hay MCP.
  const methodNotAllowed = (_req: Request, res: Response): void => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. El servidor MCP es sin estado (solo POST).' },
      id: null,
    });
  };
  server_.get('/api/mcp', methodNotAllowed);
  server_.delete('/api/mcp', methodNotAllowed);

  // Endpoint MCP (Streamable HTTP, sin estado: un transporte por petición).
  server_.post('/api/mcp', bearer, async (req: Request, res: Response) => {
    const auth = req.auth;
    const userId =
      auth?.extra && typeof auth.extra.userId === 'string' ? auth.extra.userId : undefined;
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
      logger.error(`Error atendiendo petición MCP: ${String(error)}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_server_error' });
      }
    }
  });

  logger.log(
    `Servidor MCP montado en ${urls.resource.href} (límite: ${MCP_RATE_LIMIT_MAX} req/min por token)`,
  );
}
