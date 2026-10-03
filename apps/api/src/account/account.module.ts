import { Module } from '@nestjs/common';

import { SessionModule } from '../auth/session.module.js';
import { IncomeModule } from '../income/income.module.js';
import { TaxReturnModule } from '../tax-return/tax-return.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OauthModule } from '../oauth/oauth.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { ScenariosModule } from '../scenarios/scenarios.module.js';
import { AccountExportController } from './account-export.controller.js';
import { AccountExportService } from './account-export.service.js';
import { ConnectionsController } from './connections.controller.js';

/**
 * User account management beyond auth: "Connected applications" (list/revoke OAuth/MCP access)
 * and the GDPR export. The export must include every piece of personal data, which is why it
 * imports the data modules (positions, portfolio, scenarios, OAuth, alerts). It imports
 * `SessionModule` so that `JwtAuthGuard` validates the session cookie.
 */
@Module({
  imports: [
    OauthModule,
    SessionModule,
    PositionsModule,
    PortfolioModule,
    ScenariosModule,
    NotificationsModule,
    IncomeModule,
    TaxReturnModule,
  ],
  controllers: [ConnectionsController, AccountExportController],
  providers: [AccountExportService],
})
export class AccountModule {}
