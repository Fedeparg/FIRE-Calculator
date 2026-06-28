import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Express, Request, Response } from 'express';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { SCOPES_SUPPORTED } from '../oauth/oauth.constants';
import { OAuthUrls } from '../oauth/oauth-urls';
import { SextanteOAuthProvider } from '../oauth/oauth.provider';
import { McpService } from './mcp.service';

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
  const server_ = app.getHttpAdapter().getInstance() as Express;

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

  logger.log(`Servidor MCP montado en ${urls.resource.href}`);
}
