import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';

import type { NotificationSettingsResponse } from '@sextante/core/contracts';
import type { Env } from '../config/env.js';
import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { verifyUnsubscribeToken } from './unsubscribe-token.js';

/** Preferencias de notificación del usuario autenticado (`userId` siempre del JWT). */
@Controller('account/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationSettingsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get()
  get(@CurrentUser() user: SessionUser): Promise<NotificationSettingsResponse> {
    return this.settings.get(user.id);
  }

  @Patch()
  update(
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsResponse> {
    return this.settings.update(user.id, dto);
  }
}

/**
 * Baja de las alertas desde el email, sin sesión: la identidad la da el token firmado del
 * enlace. Solo POST, a propósito: los escáneres de enlaces del correo (antivirus, vistas
 * previas) abren con GET todo lo que ven, y un GET que diera de baja desactivaría las alertas
 * sin que nadie lo pidiera. El email enlaza a una página que confirma con este POST, y la
 * cabecera `List-Unsubscribe-Post` hace que los clientes compatibles lo llamen en un clic.
 *
 * Siempre 204, también con un token inválido: no revela si un usuario existe.
 */
@Controller('notifications')
export class UnsubscribeController {
  private readonly secret: string;

  constructor(
    private readonly settings: NotificationSettingsService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.getOrThrow('JWT_SECRET', { infer: true });
  }

  @Post('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async unsubscribe(@Query('token') token?: string): Promise<void> {
    const userId = typeof token === 'string' ? verifyUnsubscribeToken(token, this.secret) : null;
    if (userId) await this.settings.unsubscribe(userId);
  }
}
