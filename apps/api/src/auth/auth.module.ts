import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { NotificationsModule } from '../notifications/notifications.module.js';
import { OauthModule } from '../oauth/oauth.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { ScenariosModule } from '../scenarios/scenarios.module.js';
import { EmailModule } from '../email/email.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { SESSION_TTL_SECONDS } from './session.constants.js';

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
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
