import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { consentSchema, type ConsentDto } from './dto/consent.dto.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';

/**
 * Endpoints backing the OAuth consent screen (the UI lives in Next: `/oauth/consent`). The
 * provider redirects the browser to that page; on approval, the page records the consent here
 * (session required) and resumes the `/authorize` flow.
 *
 * Everything requires a signed-in session (JwtAuthGuard) and the `userId` is always read from the
 * JWT: a user cannot grant consent on behalf of someone else.
 */
@Controller('oauth/consent')
@UseGuards(JwtAuthGuard)
export class ConsentController {
  constructor(
    private readonly clients: OAuthClientsStore,
    private readonly grants: OAuthGrantsService,
  ) {}

  /**
   * Client data for the screen: readable name, URL and its registered `redirect_uris`. The
   * screen only hands control back (on denial) to one of those URIs: the `/oauth/consent` query is
   * controlled by whoever sends the link and cannot be trusted.
   */
  @Get('client/:clientId')
  async clientInfo(
    @Param('clientId') clientId: string,
  ): Promise<{ clientName: string | null; clientUri: string | null; redirectUris: string[] }> {
    const client = await this.clients.getClient(clientId);
    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return {
      clientName: client.client_name ?? null,
      clientUri: client.client_uri ?? null,
      redirectUris: client.redirect_uris,
    };
  }

  /**
   * Records the user's consent for the given client and scopes. 404 if the client is not
   * registered: `oauth_grants.client_id` has no FK, and without this check orphan consents would be
   * stored for made-up ids.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async approve(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(consentSchema)) dto: ConsentDto,
  ): Promise<{ ok: true }> {
    if (!(await this.clients.getClient(dto.clientId))) {
      throw new NotFoundException('Cliente no encontrado');
    }
    await this.grants.recordConsent(user.id, dto.clientId, dto.scopes);
    return { ok: true };
  }
}
