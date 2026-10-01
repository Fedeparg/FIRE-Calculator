import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module.js';
import { OauthModule } from '../oauth/oauth.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { ScenariosModule } from '../scenarios/scenarios.module.js';
import { EmailModule } from '../email/email.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionModule } from './session.module.js';

@Module({
  imports: [
    EmailModule,
    PositionsModule,
    // La exportación RGPD debe incluir todo dato personal: lotes e histórico (PortfolioModule)
    // y escenarios guardados (ScenariosModule) además de las posiciones.
    PortfolioModule,
    ScenariosModule,
    OauthModule,
    // Preferencias de avisos por email, también datos personales.
    NotificationsModule,
    SessionModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
