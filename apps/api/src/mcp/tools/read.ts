import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  HISTORY_DEFAULT_DAYS,
  HISTORY_MAX_DAYS,
  type PortfolioSnapshotsService,
} from '../../portfolio/portfolio-snapshots.service.js';
import { incomeQuerySchema } from '../../income/dto/income-query.dto.js';
import type { IncomeService } from '../../income/income.service.js';
import type { PortfolioValuationService } from '../../portfolio/portfolio-valuation.service.js';
import type { PositionLotsService } from '../../positions/position-lots.service.js';
import type { PositionsService } from '../../positions/positions.service.js';
import type { InstrumentSearchProvider } from '../../prices/instrument-search.js';
import { jsonResult } from '../mcp-results.js';
import { CURRENCY_VALUES } from './tool-schemas.js';
import type { ToolRunner } from './tool-runner.js';

export type ReadToolDeps = {
  positions: PositionsService;
  lots: PositionLotsService;
  valuation: PortfolioValuationService;
  snapshots: PortfolioSnapshotsService;
  instruments: InstrumentSearchProvider;
  income: IncomeService;
};

/** Read-only tools (scope `portfolio:read`). */
export function registerReadTools(server: McpServer, runner: ToolRunner, deps: ReadToolDeps): void {
  server.registerTool(
    'list_positions',
    {
      title: 'Listar posiciones de la cartera',
      description:
        'Devuelve todas las posiciones de la cartera del usuario autenticado (símbolo, ' +
        'nombre, cantidad, precio medio, bróker y divisa). Solo lectura.',
      annotations: { readOnlyHint: true },
    },
    () =>
      runner.run('list_positions', async () => {
        const positions = await deps.positions.findAllByUser(runner.userId);
        return jsonResult({ positions });
      }),
  );

  server.registerTool(
    'get_portfolio_valuation',
    {
      title: 'Valorar la cartera (valor de mercado y P&L)',
      description:
        'Calcula el valor actual y la ganancia/pérdida (P&L) de la cartera con el último ' +
        'precio conocido de cada posición. Devuelve el agregado convertido a la divisa ' +
        '`display` (las posiciones sin precio o en divisa no convertible se excluyen del ' +
        'total y se señalan) y el desglose por posición en su divisa nativa. Los derivados ' +
        '(`isDerivative`) se registran pero Sextante no sigue su precio: nunca entran en el ' +
        'total. Solo lectura.',
      inputSchema: {
        display: z.enum(CURRENCY_VALUES).optional().describe('Divisa del total agregado (por defecto EUR).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ display }) =>
      runner.run('get_portfolio_valuation', async () => {
        const result = await deps.valuation.valuate(runner.userId, display ?? 'EUR');
        return jsonResult(result);
      }),
  );

  server.registerTool(
    'get_position',
    {
      title: 'Detalle y P&L de una posición',
      description:
        'Devuelve una posición por su id, con su valor de mercado y P&L en la divisa de la ' +
        'posición. El id se obtiene de `list_positions` o `get_portfolio_valuation`. Solo lectura.',
      inputSchema: {
        id: z.string().min(1).describe('Id de la posición.'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ id }) =>
      runner.run('get_position', async () => {
        const position = await deps.valuation.valuateOne(runner.userId, id);
        return jsonResult({ position });
      }),
  );

  server.registerTool(
    'search_instruments',
    {
      title: 'Buscar instrumentos por nombre o símbolo',
      description:
        'Busca acciones, ETFs, fondos y cripto por texto libre ("bitcoin", "apple", "world ' +
        'etf") y devuelve el símbolo EXACTO de cada resultado, con su nombre, tipo y ' +
        'mercado. ÚSALA SIEMPRE antes de `add_position` para obtener el símbolo correcto en ' +
        'lugar de deducirlo: un ticker suelto es ambiguo (p. ej. "BTC" es un ETF real en ' +
        'NYSE; Bitcoin es "BTC-USD"). Solo lectura.',
      inputSchema: {
        query: z.string().min(1).max(64).describe('Texto a buscar (nombre o símbolo).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query }) =>
      runner.run('search_instruments', async () => {
        // Same provider as `GET /api/instruments/search`: the LLM and the UI see exactly the
        // same results.
        const results = await deps.instruments.search(query);
        return jsonResult({ results });
      }),
  );

  server.registerTool(
    'get_portfolio_history',
    {
      title: 'Histórico de valoración de la cartera',
      description:
        'Devuelve la serie diaria de coste y valor de mercado de la cartera (un punto por ' +
        'día), para analizar la evolución y la rentabilidad por periodo. Los ' +
        'importes se guardan en EUR y se reexpresan a la divisa `display` con las tasas de ' +
        'CADA día. La serie se reconstruye desde la primera operación de la cartera (hasta 5 ' +
        'años, con la cantidad que se tenía cada día). Los puntos anteriores a que el ' +
        'usuario empezara a registrar su cartera en Sextante son una reconstrucción y ' +
        'llevan `estimated: true`; desde ese momento los puntos llevan `estimated: false` ' +
        '(captura diaria, o reconstrucción de un día que la captura no cubrió o que ' +
        'quedó obsoleta al registrar operaciones antiguas). Una cuenta ' +
        'recién creada tiene pocos puntos. Solo lectura.',
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(HISTORY_MAX_DAYS)
          .optional()
          .describe(`Ventana en días hacia atrás (por defecto ${HISTORY_DEFAULT_DAYS}).`),
        display: z
          .enum(CURRENCY_VALUES)
          .optional()
          .describe('Divisa en la que devolver los importes (por defecto EUR).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ days, display }) =>
      runner.run('get_portfolio_history', async () => {
        const history = await deps.snapshots.history(runner.userId, days, display);
        return jsonResult(history);
      }),
  );

  server.registerTool(
    'list_position_lots',
    {
      title: 'Listar las operaciones (lotes) de una posición',
      description:
        'Devuelve las compras y ventas registradas de una posición, en orden cronológico, ' +
        'con fecha, cantidad, precio y comisiones. La cantidad y el precio medio de la ' +
        'posición se DERIVAN de estos lotes (coste medio móvil). El id se obtiene de ' +
        '`list_positions`. Solo lectura.',
      inputSchema: {
        positionId: z.string().min(1).describe('Id de la posición.'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ positionId }) =>
      runner.run('list_position_lots', async () => {
        const lots = await deps.lots.listByPosition(runner.userId, positionId);
        return jsonResult({ lots });
      }),
  );

  server.registerTool(
    'list_income',
    {
      title: 'Listar dividendos, intereses y recompensas',
      description:
        'Devuelve los cobros del usuario que tributan como rendimientos del capital mobiliario: ' +
        'dividendos (`dividend`), intereses (`interest`) y recompensas del bróker como el ' +
        'saveback (`benefit`, que se declaran como intereses). Cada cobro trae el íntegro, la ' +
        'retención en origen (`withholdingOrigin`, null si no se sabe) y la española, en su ' +
        'divisa, y `reportedToAeat`: si el pagador ya lo comunicó a Hacienda y puede estar en el ' +
        'borrador. Filtra por ejercicio (`year`) o posición. Solo lectura.',
      inputSchema: incomeQuerySchema.shape,
      annotations: { readOnlyHint: true },
    },
    (query) =>
      runner.run('list_income', async () => {
        const income = await deps.income.list(runner.userId, query);
        return jsonResult({ income });
      }),
  );
}
