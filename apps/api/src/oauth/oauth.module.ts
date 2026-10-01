import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ConsentController } from './consent.controller.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';
import { OAuthReaper } from './oauth-reaper.js';
import { OAuthUrls } from './oauth-urls.js';
import { SextanteOAuthProvider } from './oauth.provider.js';

/**
 * Módulo del Authorization Server MCP. Provee el provider del SDK (respaldado por Drizzle),
 * el almacén de clientes, el servicio de consentimientos y las URLs canónicas. El montaje
 * de los endpoints HTTP OAuth (`mcpAuthRouter`) y del endpoint MCP se hace en `main.ts`
 * porque deben colgar de la RAÍZ (fuera del prefijo `/api`); por eso se exportan el provider
 * y las URLs para recuperarlos del contenedor allí.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [ConsentController],
  providers: [OAuthUrls, OAuthClientsStore, OAuthGrantsService, SextanteOAuthProvider, OAuthReaper, JwtAuthGuard],
  exports: [SextanteOAuthProvider, OAuthUrls, OAuthGrantsService, OAuthClientsStore],
})
export class OauthModule {}
