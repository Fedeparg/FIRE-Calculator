import { Module } from '@nestjs/common';

import { PortfolioModule } from '../portfolio/portfolio.module';
import { PositionsModule } from '../positions/positions.module';
import { McpAuditService } from './mcp-audit.service';
import { McpService } from './mcp.service';

/**
 * Módulo del servidor MCP (tools sobre la cartera). El montaje del endpoint HTTP `/api/mcp`
 * (transporte Streamable HTTP + `requireBearerAuth`) se hace en `main.ts`, donde se recupera
 * `McpService` del contenedor; por eso se exporta.
 */
@Module({
  imports: [PositionsModule, PortfolioModule],
  providers: [McpService, McpAuditService],
  exports: [McpService],
})
export class McpModule {}
