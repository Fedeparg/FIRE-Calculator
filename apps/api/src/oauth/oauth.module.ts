import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsentController } from './consent.controller';
import { OAuthClientsStore } from './oauth-clients.store';
import { OAuthGrantsService } from './oauth-grants.service';
import { OAuthReaper } from './oauth-reaper';
import { OAuthUrls } from './oauth-urls';
import { SextanteOAuthProvider } from './oauth.provider';

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
  providers: [
    OAuthUrls,
    OAuthClientsStore,
    OAuthGrantsService,
    SextanteOAuthProvider,
    OAuthReaper,
    JwtAuthGuard,
  ],
  exports: [SextanteOAuthProvider, OAuthUrls, OAuthGrantsService, OAuthClientsStore],
})
export class OauthModule {}
