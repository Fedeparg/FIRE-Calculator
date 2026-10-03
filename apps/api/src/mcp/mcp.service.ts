import { Inject, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { IncomeService } from '../income/income.service.js';
import { PortfolioSnapshotsService } from '../portfolio/portfolio-snapshots.service.js';
import { PortfolioValuationService } from '../portfolio/portfolio-valuation.service.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import { PositionsService } from '../positions/positions.service.js';
import { INSTRUMENT_SEARCH, type InstrumentSearchProvider } from '../prices/instrument-search.js';
import { SavedScenariosService } from '../scenarios/saved-scenarios.service.js';
import { TaxReturnService } from '../tax-return/tax-return.service.js';
import { McpAuditService } from './mcp-audit.service.js';
import { registerAnalysisTools } from './tools/analysis.js';
import { registerCalculatorTools } from './tools/calculators.js';
import { registerReadTools } from './tools/read.js';
import { ToolRunner, type McpContext } from './tools/tool-runner.js';
import { registerWriteTools } from './tools/write.js';

export type { McpContext } from './tools/tool-runner.js';

/**
 * Construye, por petición, el servidor MCP con las tools de Sextante. Se crea fresco con el
 * contexto del usuario autenticado para que las tools cierren sobre SU `userId` y nunca
 * puedan acceder a datos de otro. Las tools (en `tools/`, una por grupo) reutilizan los
 * servicios existentes (sin duplicar lógica de negocio) y, en escritura, los MISMOS DTOs que
 * la API REST (sin drift de validación).
 */
@Injectable()
export class McpService {
  constructor(
    private readonly positions: PositionsService,
    private readonly lots: PositionLotsService,
    private readonly valuation: PortfolioValuationService,
    private readonly snapshots: PortfolioSnapshotsService,
    private readonly scenarios: SavedScenariosService,
    @Inject(INSTRUMENT_SEARCH) private readonly instruments: InstrumentSearchProvider,
    private readonly income: IncomeService,
    private readonly taxReturn: TaxReturnService,
    private readonly audit: McpAuditService,
  ) {}

  createServer(ctx: McpContext): McpServer {
    const server = new McpServer(
      { name: 'sextante', version: '0.1.0' },
      {
        instructions:
          'Sextante es una suite de finanzas personales e independencia financiera (FIRE) ' +
          'centrada en la fiscalidad española, con un agregador de cartera. Tiene dos tipos ' +
          'de herramientas. (1) Calculadoras: cálculo puro sobre lo que envíes, con el mismo ' +
          'motor que la web (IRPF por comunidad, hipotecas, FIRE, Monte Carlo, impuestos de ' +
          'patrimonio y donaciones…); no leen datos del usuario. Flujo: llama a ' +
          '`list_calculators` (opcionalmente filtrando por `category` o `slug`) para ver los ' +
          'slugs y el esquema de entrada de cada una, y luego a `calculate` con ' +
          '`{ calculator: <slug>, inputs: {...} }`. Los porcentajes van en base 100. ' +
          '(2) Cartera: leer, analizar y (con permiso de ' +
          'escritura) modificar las posiciones del usuario autenticado, incluidas las ' +
          'plusvalías realizadas por ejercicio para la declaración de la Renta, los dividendos e ' +
          'intereses cobrados (`list_income`), el informe de la base del ahorro de un ejercicio para ' +
          'rellenar la Renta WEB (`get_tax_return_report`: ventas, cobros, compensaciones, cuota y ' +
          'procedencia de cada cifra), el reparto por ' +
          'activo/bróker/divisa y el progreso hacia su objetivo FIRE. Los escenarios que el ' +
          'usuario guardó en las calculadoras están en `list_saved_scenarios`. Todo es ' +
          'orientativo y no constituye asesoramiento. Los importes de cada posición están en su ' +
          'divisa nativa; el agregado de `get_portfolio_valuation` se convierte a la divisa ' +
          '`display` elegida. Cada posición tiene además sus LOTES (compras y ventas con ' +
          'fecha), de los que se derivan su cantidad y su precio medio, y la cartera tiene un ' +
          'HISTÓRICO diario de valoración en EUR. Para dar de alta un símbolo, búscalo antes ' +
          'con `search_instruments` en vez de deducir el ticker.',
      },
    );

    const runner = new ToolRunner(ctx, this.audit);
    const deps = {
      positions: this.positions,
      lots: this.lots,
      valuation: this.valuation,
      snapshots: this.snapshots,
      scenarios: this.scenarios,
      instruments: this.instruments,
      income: this.income,
      taxReturn: this.taxReturn,
    };
    registerReadTools(server, runner, deps);
    registerAnalysisTools(server, runner, deps);
    registerWriteTools(server, runner, deps);
    registerCalculatorTools(server, runner);
    return server;
  }
}
