import { Inject, Injectable, Logger } from '@nestjs/common';

import { DRIZZLE, type Database } from '../db/database.module';
import { mcpAuditLog } from '../db/schema';

/**
 * Registro de auditoría de invocaciones MCP. Guarda solo METADATOS de la llamada (usuario,
 * cliente, tool, resultado), nunca los datos de la cartera. Trazabilidad e investigación de
 * incidentes (parte de las barreras anti data-leakage). Best-effort: un fallo al auditar no
 * debe tumbar la operación del usuario.
 */
@Injectable()
export class McpAuditService {
  private readonly logger = new Logger(McpAuditService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async record(
    userId: string,
    clientId: string | null,
    tool: string,
    outcome: 'ok' | 'error' | 'denied_scope',
  ): Promise<void> {
    try {
      await this.db.insert(mcpAuditLog).values({ userId, clientId, tool, outcome });
    } catch (error) {
      this.logger.warn(`No se pudo registrar auditoría MCP (${tool}): ${String(error)}`);
    }
  }
}
