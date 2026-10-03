import { Module } from '@nestjs/common';

import { IncomeModule } from '../income/income.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { ScenariosModule } from '../scenarios/scenarios.module.js';
import { TaxReturnModule } from '../tax-return/tax-return.module.js';
import { McpAuditService } from './mcp-audit.service.js';
import { McpService } from './mcp.service.js';

/** MCP server. The `/api/mcp` endpoint is mounted in `main.ts`, which fetches `McpService` (hence the export). */
@Module({
  // `PricesModule`: the `INSTRUMENT_SEARCH` provider behind `search_instruments`, the same one used to add positions.
  // `TaxReturnModule`: the tax return (Renta) report behind `get_tax_return_report` and `get_realised_gains`.
  imports: [PositionsModule, PortfolioModule, PricesModule, ScenariosModule, IncomeModule, TaxReturnModule],
  providers: [McpService, McpAuditService],
  exports: [McpService],
})
export class McpModule {}
