import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';

import { AuthService, type SessionUser } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { RequestLinkDto } from './dto/request-link.dto';
import { VerifyDto } from './dto/verify.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './session.constants';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Solicita un magic link. Limitado para evitar abuso / bombardeo de emails. */
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async request(@Body() dto: RequestLinkDto): Promise<{ ok: true }> {
    await this.auth.requestLink(dto.email);
    // Siempre 202, sin revelar si el email existe (evita enumeración de usuarios).
    return { ok: true };
  }

  /** Canjea el token del enlace por una sesión (cookie HttpOnly con el JWT). */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() dto: VerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const user = await this.auth.verify(dto.token);
    const jwt = await this.auth.signSession(user);
    res.cookie(SESSION_COOKIE, jwt, this.cookieOptions());
    return user;
  }

  /** Cierra la sesión borrando la cookie. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    return { ok: true };
  }

  /** Devuelve el usuario autenticado (o 401). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      // Secure explícito (no atado a NODE_ENV): así la API dockerizada puede servir
      // a un frontend en http://localhost sin que el navegador rechace la cookie.
      // En producción (HTTPS) se pone COOKIE_SECURE=true.
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS * 1000,
    };
  }
}
