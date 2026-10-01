import { Module } from '@nestjs/common';

import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { ScenariosModule } from '../scenarios/scenarios.module.js';
import { McpAuditService } from './mcp-audit.service.js';
import { McpService } from './mcp.service.js';

/**
 * Módulo del servidor MCP (tools sobre la cartera). El montaje del endpoint HTTP `/api/mcp`
 * (transporte Streamable HTTP + `requireBearerAuth`) se hace en `main.ts`, donde se recupera
 * `McpService` del contenedor; por eso se exporta.
 */
@Module({
  // `PricesModule` aporta el buscador de instrumentos (`INSTRUMENT_SEARCH`) que usa la tool
  // `search_instruments`: el MISMO que el alta de posiciones, sin duplicar proveedor.
  imports: [PositionsModule, PortfolioModule, PricesModule, ScenariosModule],
  providers: [McpService, McpAuditService],
  exports: [McpService],
})
export class McpModule {}
