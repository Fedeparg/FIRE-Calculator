import { Module } from '@nestjs/common';

import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { ScenariosModule } from '../scenarios/scenarios.module.js';
import { McpAuditService } from './mcp-audit.service.js';
import { McpService } from './mcp.service.js';

/** Servidor MCP. El endpoint `/api/mcp` se monta en `main.ts`, que recupera `McpService` (de ahí el export). */
@Module({
  // `PricesModule`: el buscador `INSTRUMENT_SEARCH` de la tool `search_instruments`, el mismo del alta de posiciones.
  imports: [PositionsModule, PortfolioModule, PricesModule, ScenariosModule],
  providers: [McpService, McpAuditService],
  exports: [McpService],
})
export class McpModule {}
