import { Module } from '@nestjs/common';

import { ConsentController } from './consent.controller.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';
import { OAuthUrls } from './oauth-urls.js';
import { SextanteOAuthProvider } from './oauth.provider.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Módulo del Authorization Server MCP. Provee el provider del SDK (respaldado por Drizzle),
 * el almacén de clientes, el servicio de consentimientos y las URLs canónicas. El montaje
 * de los endpoints HTTP OAuth (`mcpAuthRouter`) y del endpoint MCP se hace en `main.ts`
 * porque deben colgar de la RAÍZ (fuera del prefijo `/api`); por eso se exportan el provider
 * y las URLs para recuperarlos del contenedor allí.
 */
@Module({
  imports: [SessionModule],
  controllers: [ConsentController],
  providers: [OAuthUrls, OAuthClientsStore, OAuthGrantsService, SextanteOAuthProvider],
  exports: [SextanteOAuthProvider, OAuthUrls, OAuthGrantsService, OAuthClientsStore],
})
export class OauthModule {}
