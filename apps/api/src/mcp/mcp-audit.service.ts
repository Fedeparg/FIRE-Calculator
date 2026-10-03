import { Inject, Injectable, Logger } from '@nestjs/common';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { mcpAuditLog } from '../db/schema.js';

/**
 * Audit log of MCP invocations. Stores only call METADATA (user, client, tool, outcome), never
 * portfolio data. For traceability and incident investigation (part of the anti data-leakage
 * barriers). Best-effort: a failure to audit must not break the user's operation.
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
      this.logger.warn(`Could not record MCP audit entry (${tool}): ${String(error)}`);
    }
  }
}
