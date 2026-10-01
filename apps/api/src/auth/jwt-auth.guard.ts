import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { users } from '../db/schema.js';
import type { SessionUser } from './auth.service.js';
import { SESSION_COOKIE } from '@sextante/core/contracts';

type JwtPayload = { sub: string; email: string };

/** Petición con el usuario autenticado adjunto. */
export type AuthedRequest = Request & { user: SessionUser };

/**
 * Protege rutas exigiendo una cookie de sesión con un JWT válido. Adjunta el usuario
 * a `request.user`. La autorización se decide SIEMPRE en el servidor.
 *
 * Además de verificar la firma, comprueba que el usuario del token **sigue existiendo**
 * en BD: un JWT con firma válida cuyo `sub` ya no existe (cuenta borrada, o BD reseteada
 * en dev) debe rechazarse limpiamente con 401, no actuar como un usuario fantasma. Esto
 * cuesta un SELECT por request autenticado, asumible a esta escala.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const cookies = (request.cookies ?? {}) as Record<string, string | undefined>;
    const token = cookies[SESSION_COOKIE];

    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    const [user] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) {
      // Firma válida pero el usuario ya no existe: sesión muerta.
      throw new UnauthorizedException('La sesión ya no es válida; vuelve a iniciar sesión');
    }

    request.user = { id: payload.sub, email: payload.email };
    return true;
  }
}
