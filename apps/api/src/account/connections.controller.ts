import { Controller, Delete, Get, HttpCode, HttpStatus, Param, UseGuards } from '@nestjs/common';

import type { ConnectedApp } from '@sextante/core/contracts';
import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OAuthGrantsService } from '../oauth/oauth-grants.service.js';

/**
 * Management of "Connected applications" (GDPR): list and revoke the OAuth/MCP clients the
 * user has granted access to their portfolio. Everything requires a session (JwtAuthGuard) and
 * the `userId` is always read from the JWT: nobody can see or revoke someone else's connections.
 * See `_local/mcp-integracion.md`.
 */
@Controller('account/connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(private readonly grants: OAuthGrantsService) {}

  /** Lists the user's connected applications, with their human-readable name. */
  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<ConnectedApp[]> {
    const grants = await this.grants.listWithClients(user.id);
    return grants.map((g) => ({
      clientId: g.clientId,
      clientName: g.clientName,
      clientUri: g.clientUri,
      scopes: g.scopes,
      createdAt: g.createdAt.toISOString(),
      lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
    }));
  }

  /** Revokes a client's access: deletes the consent and all its tokens. */
  @Delete(':clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: SessionUser, @Param('clientId') clientId: string): Promise<void> {
    await this.grants.revoke(user.id, clientId);
  }
}
