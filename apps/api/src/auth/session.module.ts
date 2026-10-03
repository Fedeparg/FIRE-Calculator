import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { Env } from '../config/env.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { SessionService } from './session.service.js';
import { SESSION_TTL_SECONDS } from './session.constants.js';

/**
 * Firma y valida la sesión (`SessionService`): registra `JwtModule` una sola vez con el secreto
 * de auth. Cualquier módulo con controllers protegidos por `JwtAuthGuard` lo importa. No depende
 * de ningún otro módulo de la app, así que no crea ciclos (`AuthModule` importa a casi todos).
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.getOrThrow('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  providers: [SessionService, JwtAuthGuard],
  exports: [SessionService, JwtAuthGuard],
})
export class SessionModule {}
