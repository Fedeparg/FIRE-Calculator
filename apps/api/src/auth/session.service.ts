import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';

import { SESSION_COOKIE, type SessionUser } from '@sextante/core/contracts';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { users } from '../db/schema.js';

/** Payload del JWT de sesión. */
type SessionJwt = { sub: string; email: string };

/**
 * Única verificación de la sesión del magic link (cookie JWT). La usan `JwtAuthGuard` (rutas
 * de la API) y el provider OAuth (`/authorize`), para que los dos apliquen la misma regla:
 * firma y caducidad válidas y usuario que SIGUE existiendo (una cuenta borrada, o la BD
 * reseteada en dev, no deja sesiones fantasma). Cuesta un SELECT por petición autenticada,
 * asumible a esta escala.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** Firma el JWT de sesión de un usuario. */
  sign(user: SessionUser): Promise<string> {
    const payload: SessionJwt = { sub: user.id, email: user.email };
    return this.jwt.signAsync(payload);
  }

  /** Usuario de la cookie de sesión de la petición, o `null` si no hay sesión válida. */
  async resolve(req: Request): Promise<SessionUser | null> {
    const cookies = (req.cookies ?? {}) as Partial<Record<string, string>>;
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;

    let payload: SessionJwt;
    try {
      payload = await this.jwt.verifyAsync<SessionJwt>(token);
    } catch {
      return null;
    }

    const [user] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) return null;
    return { id: payload.sub, email: payload.email };
  }
}
