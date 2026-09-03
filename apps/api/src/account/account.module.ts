import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SESSION_TTL_SECONDS } from '../auth/session.constants.js';
import { OauthModule } from '../oauth/oauth.module.js';
import { ConnectionsController } from './connections.controller.js';

/**
 * Gestión de cuenta del usuario más allá de auth: "Aplicaciones conectadas" (listar/revocar
 * accesos OAuth/MCP). Reutiliza los servicios del OauthModule (grants + clients) sin duplicar
 * acceso a datos. Registra JwtModule con el mismo secreto para que `JwtAuthGuard` valide la
 * cookie de sesión.
 */
@Module({
  imports: [
    OauthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [ConnectionsController],
  providers: [JwtAuthGuard],
})
export class AccountModule {}
