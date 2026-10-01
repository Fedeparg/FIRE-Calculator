import { Injectable } from '@nestjs/common';

import type { SavedScenarioResponse } from '@sextante/core/contracts';
import type { HistoryPointDto } from '@sextante/core/portfolio/types';
import type { SessionUser } from '../auth/auth.service.js';
import { NotificationSettingsService } from '../notifications/notification-settings.service.js';
import { OAuthClientsStore } from '../oauth/oauth-clients.store.js';
import { OAuthGrantsService } from '../oauth/oauth-grants.service.js';
import {
  PortfolioSnapshotsService,
  HISTORY_MAX_DAYS,
} from '../portfolio/portfolio-snapshots.service.js';
import { PositionLotsService, type PositionLotResponse } from '../positions/position-lots.service.js';
import { PositionsService, type PositionResponse } from '../positions/positions.service.js';
import { SavedScenariosService } from '../scenarios/saved-scenarios.service.js';

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
 * email de la cuenta, todas sus posiciones y sus lotes, el histórico de valoración, los
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
  portfolioHistory: HistoryPointDto[];
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
export class AccountExportService {
  constructor(
    private readonly positions: PositionsService,
    private readonly lots: PositionLotsService,
    private readonly snapshots: PortfolioSnapshotsService,
    private readonly scenarios: SavedScenariosService,
    private readonly grants: OAuthGrantsService,
    private readonly clients: OAuthClientsStore,
    private readonly notifications: NotificationSettingsService,
  ) {}

  /**
   * Exporta todos los datos personales del usuario (RGPD): email, posiciones, lotes,
   * histórico de valoración, escenarios guardados y apps conectadas. El `userId` viene
   * siempre del JWT, nunca del cliente.
   */
  async export(user: SessionUser): Promise<AccountExport> {
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
}
