import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Env } from '../config/env.js';
import { AuthService, type SessionUser } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { requestLinkSchema, type RequestLinkDto } from './dto/request-link.dto.js';
import { verifySchema, type VerifyDto } from './dto/verify.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { SESSION_COOKIE } from '@sextante/core/contracts';
import { SESSION_TTL_SECONDS } from './session.constants.js';
import { SessionService } from './session.service.js';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Requests a magic link. Rate-limited to prevent abuse and email bombing. */
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async request(
    @Body(new ZodValidationPipe(requestLinkSchema)) dto: RequestLinkDto,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    this.logDetectedIp(req);
    await this.auth.requestLink(dto.email, dto.locale ?? 'es');
    // Always 202, without revealing whether the email exists (prevents user enumeration).
    return { ok: true };
  }

  /** Redeems the link token for a session (HttpOnly cookie holding the JWT). */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body(new ZodValidationPipe(verifySchema)) dto: VerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const user = await this.auth.verify(dto.token);
    const jwt = await this.sessions.sign(user);
    res.cookie(SESSION_COOKIE, jwt, this.cookieOptions());
    return user;
  }

  /**
   * Logs out: invalidates the JWT on the server (bumps the user's session version) and clears
   * the cookie. Without the former, anyone holding on to the JWT could keep using it until it
   * expired. Since the version is per user, this also closes their other sessions. Without a
   * valid session it only clears the cookie (idempotent, no 401).
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const user = await this.sessions.resolve(req);
    if (user) await this.sessions.revokeAll(user.id);
    res.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    return { ok: true };
  }

  /** Closes every open session of the user, on all their devices, including this one. */
  @Post('sessions/revoke')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeSessions(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.sessions.revokeAll(user.id);
    res.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    return { ok: true };
  }

  /** Returns the authenticated user (or 401). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }

  /**
   * GDPR right to erasure: deletes the authenticated user's account (their positions go via
   * cascade) and clears the session cookie. The `userId` is read from the JWT.
   */
  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.deleteAccount(user.id);
    res.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  /**
   * Diagnostic log of the real client IP detected. Only on this route (it is limited to 5 req/min,
   * so it does not flood the log) and on purpose: rate limiting depends on `TRUST_PROXY_HOPS`
   * (see `main.ts`) counting the proxy hops correctly, and that cannot be inferred without seeing
   * what actually arrives in production. If `req.ip` does not match the leftmost IP in
   * `X-Forwarded-For`, the number of hops must be raised.
   *
   * It logs neither the email nor any other body field (data minimisation).
   */
  private logDetectedIp(req: Request): void {
    const forwardedFor = req.headers['x-forwarded-for'];
    const chain = Array.isArray(forwardedFor) ? forwardedFor.join(', ') : (forwardedFor ?? '-');
    this.logger.log(`Proxy diagnostics — req.ip=${req.ip ?? '-'} x-forwarded-for=${chain}`);
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      // Explicit Secure flag (not tied to NODE_ENV): this lets the dockerised API serve a
      // frontend on http://localhost without the browser rejecting the cookie.
      // In production (HTTPS), set COOKIE_SECURE=true.
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS * 1000,
    };
  }
}
