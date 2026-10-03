import { Module } from '@nestjs/common';

import { SavedScenariosController } from './saved-scenarios.controller.js';
import { SavedScenariosService } from './saved-scenarios.service.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Saved calculator scenarios in the user's account. Imports `SessionModule` so that
 * `JwtAuthGuard` validates the session cookie. The service is exported for the GDPR export
 * (`GET /api/auth/account/export`).
 */
@Module({
  imports: [SessionModule],
  controllers: [SavedScenariosController],
  providers: [SavedScenariosService],
  exports: [SavedScenariosService],
})
export class ScenariosModule {}
