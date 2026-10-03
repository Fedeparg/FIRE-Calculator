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
 * Gestión de cuenta del usuario más allá de auth: "Aplicaciones conectadas" (listar/revocar
 * accesos OAuth/MCP) y la exportación RGPD. La exportación debe incluir todo dato personal,
 * por eso importa los módulos de datos (posiciones, cartera, escenarios, OAuth, avisos). Importa
 * `SessionModule` para que `JwtAuthGuard` valide la cookie de sesión.
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
