import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from './jwt-auth.guard.js';
import { SESSION_TTL_SECONDS } from './session.constants.js';

/**
 * Valida (y, en `AuthService`, firma) la sesión: registra `JwtModule` una sola vez con el secreto
 * de auth. Cualquier módulo con controllers protegidos por `JwtAuthGuard` lo importa. No depende
 * de ningún otro módulo de la app, así que no crea ciclos (`AuthModule` importa a casi todos).
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
  providers: [JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class SessionModule {}
