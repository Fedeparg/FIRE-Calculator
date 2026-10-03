import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AccountExportService, type AccountExport } from './account-export.service.js';

/**
 * RGPD — derecho de acceso/portabilidad. La ruta sigue siendo `/api/auth/account/export` (la
 * consume el frontend y es parte del contrato público), aunque la lógica viva en `account/`
 * para que `AuthModule` no dependa de los módulos de datos. El `userId` se lee del JWT.
 */
@Controller('auth/account/export')
@UseGuards(JwtAuthGuard)
export class AccountExportController {
  constructor(private readonly accountExport: AccountExportService) {}

  /**
   * Descarga un JSON con todos los datos personales del usuario; la cabecera fuerza la descarga.
   * Es la lectura más cara de la API (todo el histórico): pocas por minuto bastan.
   */
  @Get()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header('Content-Disposition', 'attachment; filename="sextante-datos.json"')
  export(@CurrentUser() user: SessionUser): Promise<AccountExport> {
    return this.accountExport.export(user);
  }
}
