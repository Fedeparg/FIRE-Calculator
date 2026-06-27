import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import type { SessionUser } from './auth.service';
import { SESSION_COOKIE } from './session.constants';

type JwtPayload = { sub: string; email: string };

/** Petición con el usuario autenticado adjunto. */
export type AuthedRequest = Request & { user: SessionUser };

/**
 * Protege rutas exigiendo una cookie de sesión con un JWT válido. Adjunta el usuario
 * a `request.user`. La autorización se decide SIEMPRE en el servidor.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const cookies = (request.cookies ?? {}) as Record<string, string | undefined>;
    const token = cookies[SESSION_COOKIE];

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
