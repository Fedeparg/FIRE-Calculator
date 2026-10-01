import { Controller, Delete, Get, HttpCode, HttpStatus, Param, UseGuards } from '@nestjs/common';

import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OAuthClientsStore } from '../oauth/oauth-clients.store.js';
import { OAuthGrantsService } from '../oauth/oauth-grants.service.js';

/** Una aplicación conectada (consentimiento OAuth) tal y como la consume la UI. */
export interface ConnectedApp {
  clientId: string;
  clientName: string | null;
  clientUri: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Gestión de "Aplicaciones conectadas" (RGPD): listar y revocar los clientes OAuth/MCP a los
 * que el usuario ha dado acceso a su cartera. Todo exige sesión (JwtAuthGuard) y el `userId`
 * se lee siempre del JWT: nadie puede ver ni revocar las conexiones de otro.
 * Ver `_local/mcp-integracion.md`.
 */
@Controller('account/connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(
    private readonly grants: OAuthGrantsService,
    private readonly clients: OAuthClientsStore,
  ) {}

  /** Lista las aplicaciones conectadas del usuario, con su nombre legible. */
  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<ConnectedApp[]> {
    const grants = await this.grants.listForUser(user.id);
    return Promise.all(
      grants.map(async (g) => {
        const client = await this.clients.getClient(g.clientId);
        return {
          clientId: g.clientId,
          clientName: client?.client_name ?? null,
          clientUri: client?.client_uri ?? null,
          scopes: g.scopes,
          createdAt: g.createdAt.toISOString(),
          lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
        };
      }),
    );
  }

  /** Revoca el acceso de un cliente: borra el consentimiento y todos sus tokens. */
  @Delete(':clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: SessionUser, @Param('clientId') clientId: string): Promise<void> {
    await this.grants.revoke(user.id, clientId);
  }
}
