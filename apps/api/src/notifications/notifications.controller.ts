import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';

import type { NotificationSettingsResponse } from '@sextante/core/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Env } from '../config/env.js';
import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  updateNotificationSettingsSchema,
  type UpdateNotificationSettingsDto,
} from './dto/update-notification-settings.dto.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { verifyUnsubscribeToken } from './unsubscribe-token.js';

/** Notification preferences of the authenticated user (`userId` always comes from the JWT). */
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
    @Body(new ZodValidationPipe(updateNotificationSettingsSchema)) dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsResponse> {
    return this.settings.update(user.id, dto);
  }
}

/**
 * Unsubscribe from the alerts from the email, without a session: identity comes from the link's
 * signed token. POST only, on purpose: mail link scanners (antivirus, previews) open everything
 * they see with GET, and a GET that unsubscribed would disable the alerts without anyone asking.
 * The email links to a page that confirms with this POST, and the `List-Unsubscribe-Post` header
 * makes compatible clients call it in one click.
 *
 * Always 204, also with an invalid token: it does not reveal whether a user exists.
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
