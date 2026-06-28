import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module';
import { loginTokens, users, type User } from '../db/schema';
import { EMAIL_SERVICE, type EmailService } from '../email/email.service';
import {
  PositionsService,
  type PositionResponse,
} from '../positions/positions.service';

/** Validez del enlace mágico. */
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutos

export type SessionUser = { id: string; email: string };

/**
 * Exportación RGPD de los datos del usuario (derecho de portabilidad/acceso). Incluye
 * el email de la cuenta y TODAS sus posiciones. Si se añaden más datos personales en el
 * futuro, deben sumarse aquí para que la exportación siga siendo completa.
 */
export type AccountExport = {
  email: string;
  exportedAt: string;
  positions: PositionResponse[];
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly positions: PositionsService,
  ) {}

  /**
   * Genera un magic link y lo envía. No revela si el email ya existe (passwordless:
   * el usuario se crea/loguea al verificar). Idempotente de cara al cliente.
   */
  async requestLink(rawEmail: string): Promise<void> {
    const email = this.normalizeEmail(rawEmail);

    // Token en claro para el enlace; en BD solo su hash.
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.db.insert(loginTokens).values({ email, tokenHash, expiresAt });

    const appUrl = this.config.getOrThrow<string>('APP_URL');
    const link = `${appUrl}/auth/verify?token=${token}`;
    await this.email.sendMagicLink(email, link);
  }

  /**
   * Canjea el token del enlace por un usuario. El token es de un SOLO USO: el
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
   * Exporta todos los datos personales del usuario (RGPD): su email y todas sus
   * posiciones. El `userId` viene SIEMPRE del JWT, nunca del cliente.
   */
  async exportData(user: SessionUser): Promise<AccountExport> {
    const positions = await this.positions.findAllByUser(user.id);
    return {
      email: user.email,
      exportedAt: new Date().toISOString(),
      positions,
    };
  }

  /**
   * Borra la cuenta del usuario (RGPD: derecho de supresión). Elimina la fila de
   * `users`; las `positions` caen por `ON DELETE CASCADE`. El `userId` viene del JWT.
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
    return createHash('sha256').update(token).digest('hex');
  }
}
