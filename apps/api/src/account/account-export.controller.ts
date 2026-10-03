import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AccountExportService, type AccountExport } from './account-export.service.js';

/**
 * GDPR — right of access/portability. The route is still `/api/auth/account/export` (the
 * frontend consumes it and it is part of the public contract), even though the logic lives in
 * `account/` so that `AuthModule` does not depend on the data modules. The `userId` is read from the JWT.
 */
@Controller('auth/account/export')
@UseGuards(JwtAuthGuard)
export class AccountExportController {
  constructor(private readonly accountExport: AccountExportService) {}

  /**
   * Downloads a JSON with all of the user's personal data; the header forces the download.
   * It is the most expensive read in the API (the whole history): a few per minute are enough.
   */
  @Get()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header('Content-Disposition', 'attachment; filename="sextante-datos.json"')
  export(@CurrentUser() user: SessionUser): Promise<AccountExport> {
    return this.accountExport.export(user);
  }
}
