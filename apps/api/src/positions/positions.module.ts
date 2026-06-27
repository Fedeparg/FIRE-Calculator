import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SESSION_TTL_SECONDS } from '../auth/session.constants';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

/**
 * Módulo de cartera. Registra JwtModule con el mismo secreto que el de auth para que
 * `JwtAuthGuard` pueda verificar la cookie de sesión en estos endpoints.
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
  controllers: [PositionsController],
  providers: [PositionsService, JwtAuthGuard],
})
export class PositionsModule {}
