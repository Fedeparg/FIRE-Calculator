import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import type { SessionUser } from './auth.service.js';
import { SessionService } from './session.service.js';

/** Request with the authenticated user attached. */
export type AuthedRequest = Request & { user: SessionUser };

/**
 * Protects routes by requiring a valid session cookie (see `SessionService.resolve`: signature,
 * expiry and a user that still exists). Attaches the user to `request.user`. Authorisation is
 * always decided on the server.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.sessions.resolve(request);
    if (!user) {
      throw new UnauthorizedException();
    }
    request.user = user;
    return true;
  }
}
