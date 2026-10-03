import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, sql } from 'drizzle-orm';
import type { Request } from 'express';

import { SESSION_COOKIE, type SessionUser } from '@sextante/core/contracts';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { users } from '../db/schema.js';

/**
 * Payload del JWT de sesión. `ver` es la versión de sesión del usuario al firmarlo: si la de BD
 * ha subido (cerrar sesión, "cerrar todas las sesiones"), el JWT deja de valer aunque su firma y
 * su caducidad sigan bien. Es opcional: los JWT emitidos antes de existir la columna no la
 * llevan y cuentan como versión 0, la inicial, para no desloguear a todo el mundo al desplegar.
 */
type SessionJwt = { sub: string; email: string; ver?: number };

/**
 * Única verificación de la sesión del magic link (cookie JWT). La usan `JwtAuthGuard` (rutas
 * de la API) y el provider OAuth (`/authorize`), para que los dos apliquen la misma regla:
 * firma y caducidad válidas, usuario que SIGUE existiendo (una cuenta borrada, o la BD
 * reseteada en dev, no deja sesiones fantasma) y versión de sesión vigente (una sesión
 * cerrada no se puede reutilizar aunque alguien se haya quedado con el JWT). Cuesta un SELECT
 * por petición autenticada, asumible a esta escala.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** Firma el JWT de sesión de un usuario con su versión de sesión actual. */
  async sign(user: SessionUser): Promise<string> {
    const [row] = await this.db
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const payload: SessionJwt = { sub: user.id, email: user.email, ver: row?.sessionVersion ?? 0 };
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

    const [user] = await this.db
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (!user || (payload.ver ?? 0) !== user.sessionVersion) return null;
    return { id: payload.sub, email: payload.email };
  }

  /**
   * Invalida TODAS las sesiones abiertas del usuario: sube su versión de sesión, así que los JWT
   * ya emitidos (en este y en cualquier otro dispositivo) dejan de valer.
   */
  async revokeAll(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
