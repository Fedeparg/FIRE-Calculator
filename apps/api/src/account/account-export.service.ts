import { Injectable } from '@nestjs/common';

import type { SavedScenarioResponse } from '@sextante/core/contracts';
import type { HistoryPointDto } from '@sextante/core/portfolio/types';
import type { SessionUser } from '../auth/auth.service.js';
import { NotificationSettingsService } from '../notifications/notification-settings.service.js';
import { OAuthGrantsService } from '../oauth/oauth-grants.service.js';
import { PortfolioSnapshotsService, HISTORY_MAX_DAYS } from '../portfolio/portfolio-snapshots.service.js';
import type { IncomeEvent } from '@sextante/core/fiscal/income';
import type { PendingNegative } from '@sextante/core/fiscal/savings-base';
import { IncomeService } from '../income/income.service.js';
import { PendingBalancesService } from '../tax-return/pending-balances.service.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import type { PositionLotResponse, PositionResponse } from '../positions/position.mapper.js';
import { PositionsService } from '../positions/positions.service.js';
import { SavedScenariosService } from '../scenarios/saved-scenarios.service.js';

/** A connected OAuth/MCP application, as it appears in the GDPR export. */
export type ConnectedAppExport = {
  clientId: string;
  clientName: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

/**
 * GDPR export of the user's data (right of access/portability). Includes the account email,
 * all positions and their lots, the valuation history, the saved scenarios and the connected
 * applications (OAuth/MCP access). Any personal data added in the future must be added here
 * too so the export stays complete: a new table with user data that is missing here is a
 * portability gap, even if deletion does cover it by cascade.
 */
export type AccountExport = {
  email: string;
  exportedAt: string;
  positions: PositionResponse[];
  /** Buys and sells across all positions (the history the aggregates are derived from). */
  positionLots: PositionLotResponse[];
  income: IncomeEvent[];
  savingsPendingBalances: PendingNegative[];
  /** Daily valuation series, in EUR (the base currency of the history). */
  portfolioHistory: HistoryPointDto[];
  savedScenarios: SavedScenarioResponse[];
  connectedApps: ConnectedAppExport[];
  /** Email alert preferences (opt-in). */
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
    private readonly income: IncomeService,
    private readonly pendingBalances: PendingBalancesService,
    private readonly snapshots: PortfolioSnapshotsService,
    private readonly scenarios: SavedScenariosService,
    private readonly grants: OAuthGrantsService,
    private readonly notifications: NotificationSettingsService,
  ) {}

  /**
   * Exports all of the user's personal data (GDPR): email, positions, lots, valuation
   * history, saved scenarios and connected apps. The `userId` always comes from the JWT,
   * never from the client.
   */
  async export(user: SessionUser): Promise<AccountExport> {
    // The queries are independent of each other: run them in parallel, not in series.
    const [
      positions,
      positionLots,
      income,
      savingsPendingBalances,
      history,
      savedScenarios,
      { fireAlertsEnabled, locale, lastFireMilestone },
      grants,
    ] = await Promise.all([
      this.positions.findAllByUser(user.id),
      this.lots.findAllByUser(user.id),
      this.income.list(user.id),
      this.pendingBalances.list(user.id),
      // Export the FULL history we keep (the service's cap), in EUR.
      this.snapshots.history(user.id, HISTORY_MAX_DAYS),
      this.scenarios.findAllByUser(user.id),
      this.notifications.get(user.id),
      this.grants.listWithClients(user.id),
    ]);
    const connectedApps: ConnectedAppExport[] = grants.map((g) => ({
      clientId: g.clientId,
      clientName: g.clientName,
      scopes: g.scopes,
      createdAt: g.createdAt.toISOString(),
      lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
    }));
    return {
      email: user.email,
      exportedAt: new Date().toISOString(),
      positions,
      positionLots,
      income,
      savingsPendingBalances,
      portfolioHistory: history.points,
      savedScenarios,
      connectedApps,
      notificationSettings: { fireAlertsEnabled, locale, lastFireMilestone },
    };
  }
}
