import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { ConsentDto } from './dto/consent.dto.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';

/**
 * Endpoints que respaldan la pantalla de consentimiento OAuth (la UI vive en Next:
 * `/oauth/consent`). El provider redirige el navegador a esa página; al aprobar, la página
 * registra el consentimiento aquí (sesión obligatoria) y reanuda el flujo de `/authorize`.
 *
 * Todo exige sesión iniciada (JwtAuthGuard) y el `userId` se lee siempre del JWT: un usuario
 * no puede conceder consentimiento en nombre de otro.
 */
@Controller('oauth/consent')
@UseGuards(JwtAuthGuard)
export class ConsentController {
  constructor(
    private readonly clients: OAuthClientsStore,
    private readonly grants: OAuthGrantsService,
  ) {}

  /** Datos del cliente para mostrar en la pantalla (nombre legible, URL). */
  @Get('client/:clientId')
  async clientInfo(
    @Param('clientId') clientId: string,
  ): Promise<{ clientName: string | null; clientUri: string | null }> {
    const client = await this.clients.getClient(clientId);
    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return {
      clientName: client.client_name ?? null,
      clientUri: client.client_uri ?? null,
    };
  }

  /** Registra el consentimiento del usuario para el cliente y los scopes indicados. */
  @Post()
  @HttpCode(HttpStatus.OK)
  async approve(@CurrentUser() user: SessionUser, @Body() dto: ConsentDto): Promise<{ ok: true }> {
    await this.grants.recordConsent(user.id, dto.clientId, dto.scopes);
    return { ok: true };
  }
}
