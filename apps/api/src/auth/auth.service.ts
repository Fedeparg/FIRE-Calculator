import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';

import type { SessionUser } from '@sextante/core/contracts';
import type { Env } from '../config/env.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { loginTokens, users, type User } from '../db/schema.js';
import { EMAIL_SERVICE, type EmailService } from '../email/email.service.js';
import { randomToken, sha256Hex } from '../common/crypto.js';
import { LOGIN_LINK_TTL_MINUTES } from './session.constants.js';

/** Validez del enlace mágico. */
const TOKEN_TTL_MS = LOGIN_LINK_TTL_MINUTES * 60 * 1000;

/**
 * Límite de enlaces por email: como mucho 3 cada 15 minutos. El controlador ya limita por IP,
 * pero con muchas IPs se podría bombardear una dirección (y quemar la reputación del dominio en
 * Resend). Por encima del límite se responde igual (202) sin enviar nada, para no revelar nada.
 */
export const MAX_LINKS_PER_EMAIL = 3;
export const LINKS_PER_EMAIL_WINDOW_MS = 15 * 60 * 1000;

/** Los controladores lo importan de aquí; la definición (contrato con el frontend) vive en core. */
export type { SessionUser };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Genera un magic link y lo envía. No revela si el email ya existe (passwordless:
   * el usuario se crea/loguea al verificar). Idempotente de cara al cliente.
   */
  async requestLink(rawEmail: string): Promise<void> {
    const email = this.normalizeEmail(rawEmail);

    // Token en claro para el enlace; en BD solo su hash.
    const token = randomToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // Contar y luego insertar, serializado por email con un cerrojo transaccional: si no, varias
    // peticiones simultáneas verían el mismo recuento y pasarían todas del límite.
    const allowed = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('login_links'), hashtext(${email}))`);
      const [recent] = await tx
        .select({ total: count() })
        .from(loginTokens)
        .where(
          and(
            eq(loginTokens.email, email),
            gt(loginTokens.createdAt, new Date(Date.now() - LINKS_PER_EMAIL_WINDOW_MS)),
          ),
        );
      if (recent.total >= MAX_LINKS_PER_EMAIL) return false;
      await tx.insert(loginTokens).values({ email, tokenHash, expiresAt });
      return true;
    });
    if (!allowed) {
      // Sin el email en el log (dato personal): basta con saber que el límite actúa.
      this.logger.warn(`Límite de enlaces por email alcanzado (${MAX_LINKS_PER_EMAIL} en 15 min): no se envía otro`);
      return;
    }

    const appUrl = this.config.getOrThrow('APP_URL', { infer: true });
    const link = `${appUrl}/auth/verify?token=${token}`;
    await this.email.sendMagicLink(email, link);
  }

  /**
   * Canjea el token del enlace por un usuario. El token es de un solo uso: el
   * `UPDATE ... WHERE consumedAt IS NULL ... RETURNING` lo consume atómicamente, así
   * que dos peticiones simultáneas no pueden usar el mismo token dos veces.
   */
  async verify(token: string): Promise<SessionUser> {
    const tokenHash = this.hashToken(token);

    const consumed = await this.db
      .update(loginTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(loginTokens.tokenHash, tokenHash),
          isNull(loginTokens.consumedAt),
          gt(loginTokens.expiresAt, new Date()),
        ),
      )
      .returning({ email: loginTokens.email });

    const row = consumed[0];
    if (!row) {
      throw new UnauthorizedException('Enlace no válido o caducado');
    }

    const user = await this.upsertUser(row.email);
    return { id: user.id, email: user.email };
  }

  /** Firma el JWT de sesión para un usuario. */
  signSession(user: SessionUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email });
  }

  /**
   * Borra la cuenta del usuario (RGPD: derecho de supresión). Elimina la fila de `users`; el
   * resto (`positions`, `position_lots`, `portfolio_snapshots`, `saved_scenarios`,
   * `user_notification_settings`, tokens y grants OAuth) cae por `ON DELETE CASCADE`. El `userId` viene del JWT.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId));
  }

  private async upsertUser(email: string): Promise<User> {
    await this.db.insert(users).values({ email }).onConflictDoNothing();
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (!user) {
      // No debería ocurrir (acabamos de garantizar su existencia).
      this.logger.error(`Usuario no encontrado tras upsert: ${email}`);
      throw new UnauthorizedException();
    }
    return user;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string): string {
    return sha256Hex(token);
  }
}
