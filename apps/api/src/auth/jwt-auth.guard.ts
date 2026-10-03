import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import type { SessionUser } from './auth.service.js';
import { SessionService } from './session.service.js';

/** Petición con el usuario autenticado adjunto. */
export type AuthedRequest = Request & { user: SessionUser };

/**
 * Protege rutas exigiendo una cookie de sesión válida (ver `SessionService.resolve`: firma,
 * caducidad y usuario que sigue existiendo). Adjunta el usuario a `request.user`. La
 * autorización se decide siempre en el servidor.
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
