import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import type { Env } from '../config/env.js';
import { AuthService, type SessionUser } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { RequestLinkDto } from './dto/request-link.dto.js';
import { VerifyDto } from './dto/verify.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { SESSION_COOKIE } from '@sextante/core/contracts';
import { SESSION_TTL_SECONDS } from './session.constants.js';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Solicita un magic link. Limitado para evitar abuso / bombardeo de emails. */
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async request(@Body() dto: RequestLinkDto, @Req() req: Request): Promise<{ ok: true }> {
    this.logDetectedIp(req);
    await this.auth.requestLink(dto.email);
    // Siempre 202, sin revelar si el email existe (evita enumeración de usuarios).
    return { ok: true };
  }

  /** Canjea el token del enlace por una sesión (cookie HttpOnly con el JWT). */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifyDto, @Res({ passthrough: true }) res: Response): Promise<SessionUser> {
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

  /**
   * RGPD — derecho de supresión: borra la cuenta del usuario autenticado (sus posiciones
   * caen por cascade) y limpia la cookie de sesión. El `userId` se lee del JWT.
   */
  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.deleteAccount(user.id);
    res.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  /**
   * Diagnóstico de la IP real detectada. Solo en esta ruta (está limitada a 5 req/min, así
   * que no ensucia el log) y a propósito: el rate limiting depende de que `TRUST_PROXY_HOPS`
   * (ver `main.ts`) cuente bien los saltos de proxy, y eso no se puede deducir sin ver qué
   * llega de verdad en producción. Si `req.ip` no coincide con la IP más a la izquierda de
   * `X-Forwarded-For`, hay que subir el número de saltos.
   *
   * No registra el email ni ningún otro dato del cuerpo (minimización de datos).
   */
  private logDetectedIp(req: Request): void {
    const forwardedFor = req.headers['x-forwarded-for'];
    const chain = Array.isArray(forwardedFor) ? forwardedFor.join(', ') : (forwardedFor ?? '-');
    this.logger.log(`Diagnóstico de proxy — req.ip=${req.ip ?? '-'} x-forwarded-for=${chain}`);
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      // Secure explícito (no atado a NODE_ENV): así la API dockerizada puede servir
      // a un frontend en http://localhost sin que el navegador rechace la cookie.
      // En producción (HTTPS) se pone COOKIE_SECURE=true.
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS * 1000,
    };
  }
}
