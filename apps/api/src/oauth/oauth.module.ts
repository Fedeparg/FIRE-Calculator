import { Module } from '@nestjs/common';

import { ConsentController } from './consent.controller.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';
import { OAuthUrls } from './oauth-urls.js';
import { SextanteOAuthProvider } from './oauth.provider.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * MCP Authorization Server module. Provides the SDK provider (backed by Drizzle), the client
 * store, the consent service and the canonical URLs. The OAuth HTTP endpoints (`mcpAuthRouter`)
 * and the MCP endpoint are mounted in `main.ts` because they must hang from the ROOT (outside
 * the `/api` prefix); that is why the provider and the URLs are exported, so they can be fetched
 * from the container there.
 */
@Module({
  imports: [SessionModule],
  controllers: [ConsentController],
  providers: [OAuthUrls, OAuthClientsStore, OAuthGrantsService, SextanteOAuthProvider],
  exports: [SextanteOAuthProvider, OAuthUrls, OAuthGrantsService, OAuthClientsStore],
})
export class OauthModule {}
