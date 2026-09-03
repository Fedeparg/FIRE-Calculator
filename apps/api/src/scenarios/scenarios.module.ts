import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SESSION_TTL_SECONDS } from '../auth/session.constants';
import { SavedScenariosController } from './saved-scenarios.controller';
import { SavedScenariosService } from './saved-scenarios.service';

/**
 * Escenarios guardados de calculadora en la cuenta del usuario. Registra `JwtModule` con el
 * mismo secreto que auth para que `JwtAuthGuard` valide la cookie de sesión. Se exporta el
 * servicio para la exportación RGPD (`GET /api/auth/account/export`).
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [SavedScenariosController],
  providers: [SavedScenariosService, JwtAuthGuard],
  exports: [SavedScenariosService],
})
export class ScenariosModule {}
