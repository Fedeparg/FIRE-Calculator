import { Module } from '@nestjs/common';

import { SavedScenariosController } from './saved-scenarios.controller.js';
import { SavedScenariosService } from './saved-scenarios.service.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Escenarios guardados de calculadora en la cuenta del usuario. Importa `SessionModule`
 * para que `JwtAuthGuard` valide la cookie de sesión. Se exporta el
 * servicio para la exportación RGPD (`GET /api/auth/account/export`).
 */
@Module({
  imports: [SessionModule],
  controllers: [SavedScenariosController],
  providers: [SavedScenariosService],
  exports: [SavedScenariosService],
})
export class ScenariosModule {}
