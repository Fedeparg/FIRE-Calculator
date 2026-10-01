import { Module } from '@nestjs/common';

import { OauthModule } from '../oauth/oauth.module.js';
import { ConnectionsController } from './connections.controller.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Gestión de cuenta del usuario más allá de auth: "Aplicaciones conectadas" (listar/revocar
 * accesos OAuth/MCP). Reutiliza los servicios del OauthModule (grants + clients) sin duplicar
 * acceso a datos. Importa `SessionModule` para que `JwtAuthGuard` valide la
 * cookie de sesión.
 */
@Module({
  imports: [OauthModule, SessionModule],
  controllers: [ConnectionsController],
})
export class AccountModule {}
