import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { loginTokens, users, type User } from '../db/schema.js';
import { EMAIL_SERVICE, type EmailService } from '../email/email.service.js';
import { OAuthClientsStore } from '../oauth/oauth-clients.store.js';
import { NotificationSettingsService } from '../notifications/notification-settings.service.js';
import { OAuthGrantsService } from '../oauth/oauth-grants.service.js';
import {
  PortfolioSnapshotsService,
  HISTORY_MAX_DAYS,
  type PortfolioHistoryPoint,
} from '../portfolio/portfolio-snapshots.service.js';
import {
  PositionLotsService,
  type PositionLotResponse,
} from '../positions/position-lots.service.js';
import {
  PositionsService,
  type PositionResponse,
} from '../positions/positions.service.js';
import {
  SavedScenariosService,
  type SavedScenarioResponse,
} from '../scenarios/saved-scenarios.service.js';

/** Validez del enlace mágico. */
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutos

export type SessionUser = { id: string; email: string };

/** Una aplicación OAuth/MCP conectada, tal y como aparece en la exportación RGPD. */
export type ConnectedAppExport = {
  clientId: string;
  clientName: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

/**
 * Exportación RGPD de los datos del usuario (derecho de portabilidad/acceso). Incluye el
 * email de la cuenta, TODAS sus posiciones y sus lotes, el histórico de valoración, los
 * escenarios guardados y las aplicaciones conectadas (accesos OAuth/MCP). Si se añaden más
 * datos personales en el futuro, deben sumarse aquí para que la exportación siga siendo
 * completa: una tabla nueva con datos del usuario que no aparezca aquí es un agujero de
 * portabilidad, aunque el borrado sí la cubra por cascada.
 */
export type AccountExport = {
  email: string;
  exportedAt: string;
  positions: PositionResponse[];
  /** Compras y ventas de todas sus posiciones (el histórico del que salen los agregados). */
  positionLots: PositionLotResponse[];
  /** Serie de valoración diaria, en EUR (la divisa base del histórico). */
  portfolioHistory: PortfolioHistoryPoint[];
  savedScenarios: SavedScenarioResponse[];
  connectedApps: ConnectedAppExport[];
  /** Preferencias de avisos por email (opt-in). */
  notificationSettings: {
    fireAlertsEnabled: boolean;
    locale: string;
    lastFireMilestone: number | null;
  };
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
    private readonly lots: PositionLotsService,
    private readonly snapshots: PortfolioSnapshotsService,
    private readonly scenarios: SavedScenariosService,
    private readonly grants: OAuthGrantsService,
    private readonly clients: OAuthClientsStore,
    private readonly notifications: NotificationSettingsService,
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
   * Exporta todos los datos personales del usuario (RGPD): email, posiciones, lotes,
   * histórico de valoración, escenarios guardados y apps conectadas. El `userId` viene
   * SIEMPRE del JWT, nunca del cliente.
   */
  async exportData(user: SessionUser): Promise<AccountExport> {
    const positions = await this.positions.findAllByUser(user.id);
    const positionLots = await this.lots.findAllByUser(user.id);
    // Se exporta el histórico COMPLETO que guardamos (el tope del servicio), en EUR.
    const history = await this.snapshots.history(user.id, HISTORY_MAX_DAYS);
    const savedScenarios = await this.scenarios.findAllByUser(user.id);
    const { fireAlertsEnabled, locale, lastFireMilestone } = await this.notifications.get(user.id);
    const grants = await this.grants.listForUser(user.id);
    const connectedApps: ConnectedAppExport[] = await Promise.all(
      grants.map(async (g) => {
        const client = await this.clients.getClient(g.clientId);
        return {
          clientId: g.clientId,
          clientName: client?.client_name ?? null,
          scopes: g.scopes,
          createdAt: g.createdAt.toISOString(),
          lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
        };
      }),
    );
    return {
      email: user.email,
      exportedAt: new Date().toISOString(),
      positions,
      positionLots,
      portfolioHistory: history.points,
      savedScenarios,
      connectedApps,
      notificationSettings: { fireAlertsEnabled, locale, lastFireMilestone },
    };
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
    return createHash('sha256').update(token).digest('hex');
  }
}
