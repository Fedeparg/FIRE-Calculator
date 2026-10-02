import { Module } from '@nestjs/common';

import { FxReferenceModule } from '../fx-reference/fx-reference.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { ScenariosModule } from '../scenarios/scenarios.module.js';
import { McpAuditService } from './mcp-audit.service.js';
import { McpService } from './mcp.service.js';

/** Servidor MCP. El endpoint `/api/mcp` se monta en `main.ts`, que recupera `McpService` (de ahí el export). */
@Module({
  // `PricesModule`: el buscador `INSTRUMENT_SEARCH` de la tool `search_instruments`, el mismo del alta de posiciones.
  // `FxReferenceModule`: los tipos del BCE con los que `get_realised_gains` pasa las ventas a euros.
  imports: [PositionsModule, PortfolioModule, PricesModule, ScenariosModule, FxReferenceModule],
  providers: [McpService, McpAuditService],
  exports: [McpService],
})
export class McpModule {}
