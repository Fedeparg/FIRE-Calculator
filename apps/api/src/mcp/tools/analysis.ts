import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FIRE_SEARCH_MAX_YEARS } from '@sextante/core/calculators/fire';
import { MAX_RETIREMENT_YEARS, MAX_VOLATILITY } from '@sextante/core/calculators/fire-montecarlo';
import { buildRealisedGainsReport, referenceRatesNeeded } from '@sextante/core/fiscal/realised-gains';
import {
  computeGoalProgress,
  resolveGoalTarget,
  simulatePortfolioGoal,
  type GoalTargetError,
} from '@sextante/core/portfolio/goal';
import { z } from 'zod';

import { ReferenceRatesService } from '../../fx-reference/reference-rates.service.js';
import { PortfolioValuationService } from '../../portfolio/portfolio-valuation.service.js';
import { PositionLotsService } from '../../positions/position-lots.service.js';
import { PositionsService } from '../../positions/positions.service.js';
import { SavedScenariosService } from '../../scenarios/saved-scenarios.service.js';
import { TaxReturnService } from '../../tax-return/tax-return.service.js';
import { jsonResult } from '../mcp-results.js';
import { InvalidToolInputError } from '../tool-errors.js';
import { BREAKDOWN_VALUES, CURRENCY_VALUES, FREQUENCY_VALUES } from './tool-schemas.js';
import type { ToolRunner } from './tool-runner.js';

export type AnalysisToolDeps = {
  positions: PositionsService;
  lots: PositionLotsService;
  valuation: PortfolioValuationService;
  scenarios: SavedScenariosService;
  referenceRates: ReferenceRatesService;
  taxReturn: TaxReturnService;
};

/** Mensaje al cliente MCP de cada error de `resolveGoalTarget`. */
const GOAL_TARGET_ERRORS: Record<GoalTargetError, string> = {
  amountIncomplete: 'el modo cantidad necesita targetAmount y targetYears',
  mixedModes: 'usa annualExpenses/withdrawalRate (modo FIRE) o targetAmount/targetYears (modo cantidad), no ambos',
  fireIncomplete: 'el modo FIRE necesita annualExpenses y withdrawalRate',
};

/**
 * Tools de análisis de la cartera (scope `portfolio:read`): lo que la web calcula sobre los
 * datos del usuario, con las mismas funciones de `@sextante/core`.
 */
export function registerAnalysisTools(server: McpServer, runner: ToolRunner, deps: AnalysisToolDeps): void {
  server.registerTool(
    'get_realised_gains',
    {
      title: 'Plusvalías realizadas por ejercicio (para la Renta)',
      description:
        'Ganancias y pérdidas patrimoniales de las ventas registradas, calculadas por FIFO ' +
        'como exige la normativa española y agrupadas por ejercicio fiscal, en euros: valor ' +
        'de transmisión, valor de adquisición (con comisiones) y resultado de cada venta, ' +
        'más una estimación de la cuota de la base del ahorro. Las ventas en otra divisa se ' +
        'calculan en esa divisa y se pasan a euros con el tipo de referencia del BCE del día ' +
        'de la venta (criterio de la DGT, V0152-26); la diferencia de cambio de la divisa ' +
        'invertida va aparte (`fxDifference`), suponiendo que el bróker cambia a euros al ' +
        'comprar y al vender. Las ventas sin tipo publicado van en `unconverted`, fuera de ' +
        'los totales. Sirve para preparar las casillas de ganancias patrimoniales. Compensa ' +
        'las ventas del mismo ejercicio, pero NO aplica los saldos negativos de los cuatro ' +
        'ejercicios anteriores, la compensación del 25 % con dividendos e intereses ni la ' +
        'regla de los dos meses. Solo lectura.',
      inputSchema: {
        year: z
          .number()
          .int()
          .min(1900)
          .max(2100)
          .optional()
          .describe('Ejercicio fiscal. Sin valor, devuelve todos los ejercicios con ventas.'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ year }) =>
      runner.run('get_realised_gains', async () => {
        const [positions, lots] = await Promise.all([
          deps.positions.findAllByUser(runner.userId),
          deps.lots.findAllByUser(runner.userId),
        ]);
        const lotsByPosition = new Map<string, typeof lots>();
        for (const lot of lots) {
          lotsByPosition.set(lot.positionId, [...(lotsByPosition.get(lot.positionId) ?? []), lot]);
        }
        const input = positions.map((p) => ({
          id: p.id,
          ticker: p.ticker,
          name: p.name,
          currency: p.currency,
          // Un derivado no se empareja por FIFO con una acción del mismo símbolo.
          isDerivative: p.isDerivative,
          lots: lotsByPosition.get(p.id) ?? [],
        }));
        const needed = referenceRatesNeeded(input);
        const rates = needed ? await deps.referenceRates.getRates(needed.currencies, needed.from) : {};
        const report = buildRealisedGainsReport(input, rates);
        const years = year === undefined ? report.years : report.years.filter((y) => y.year === year);
        return jsonResult({ years });
      }),
  );

  server.registerTool(
    'get_tax_return_report',
    {
      title: 'Base del ahorro de un ejercicio (para rellenar la Renta WEB)',
      description:
        'Informe de la base del ahorro de un ejercicio para ayudar a rellenar la Renta WEB, ' +
        'montado con las mismas funciones que la web. Bloques: `gains` = ventas de valores ' +
        '(FIFO, en euros, con valor de transmisión, de adquisición y resultado de cada venta ' +
        'en `sales`, más la diferencia de cambio `fxDifference`); `income` = intereses y ' +
        'dividendos cobrados (rendimientos del capital mobiliario, con retenciones en origen ' +
        'y en España y la parte que ya consta en el borrador de la AEAT); `incomeEvents` = ' +
        'cada cobro; `savings` = la base del ahorro: saldo de ganancias y pérdidas, ' +
        'rendimientos del capital, compensación de saldos negativos de años anteriores ' +
        '(incluidos los pendientes que el usuario introdujo a mano), cuota, deducción por ' +
        'doble imposición internacional y retenciones españolas (`result` = cuota − ' +
        'retenciones). `availableYears` lista los ejercicios con datos; `null` en un bloque ' +
        'significa que ese ejercicio no tiene datos de ese tipo. Las cifras son orientativas, ' +
        'no asesoramiento, y no sustituyen al borrador de la AEAT: contrástalas con él. ' +
        'Cada cifra lleva su procedencia: en los cobros, `grossSource` y ' +
        '`withholdingOriginSource` valen `broker` (dato del bróker), `derived` (calculado a ' +
        'partir de datos del bróker), `market` (dato de mercado), `estimate` (estimación, p. ' +
        'ej. el tipo legal de retención del país: hay que contrastarla con el certificado del ' +
        'pagador) o `manual` (lo escribió el usuario); en las ventas, `eur` indica el tipo ' +
        'del BCE (y su fecha) aplicado a la venta y a cada compra. Si `incomplete` es true o ' +
        '`ratesLoaded` es false, la cifra está incompleta (ventas o cobros sin tipo de cambio, ' +
        'o retención en origen desconocida) y debes avisar al usuario. Solo lectura.',
      inputSchema: {
        year: z
          .number()
          .int()
          .min(1990)
          .max(2100)
          .optional()
          .describe('Ejercicio fiscal. Sin valor, el último ejercicio con ventas o cobros.'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ year }) =>
      runner.run('get_tax_return_report', async () => jsonResult(await deps.taxReturn.build(runner.userId, year))),
  );

  server.registerTool(
    'get_portfolio_breakdown',
    {
      title: 'Reparto de la cartera',
      description:
        'Reparte el valor de mercado actual de la cartera por activo, bróker o divisa y ' +
        'devuelve el peso de cada grupo en %, convertido a la divisa `display`. Las ' +
        'posiciones sin precio o en divisa no convertible se excluyen y se cuentan; los ' +
        'derivados no entran. Solo lectura.',
      inputSchema: {
        groupBy: z.enum(BREAKDOWN_VALUES).describe('Criterio: asset (por valor), broker o currency.'),
        display: z.enum(CURRENCY_VALUES).optional().describe('Divisa del reparto (por defecto EUR).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ groupBy, display }) =>
      runner.run('get_portfolio_breakdown', async () =>
        jsonResult(await deps.valuation.breakdown(runner.userId, display ?? 'EUR', groupBy)),
      ),
  );

  server.registerTool(
    'get_fire_goal_progress',
    {
      title: 'Progreso de la cartera hacia el objetivo FIRE',
      description:
        'Mide la cartera REAL del usuario (su valor de mercado actual) contra un objetivo, ' +
        'en uno de dos modos. FIRE (`annualExpenses` + `withdrawalRate`): patrimonio ' +
        'objetivo = gasto anual / tasa de retiro; con `volatility` y `retirementYears` añade ' +
        'la probabilidad Monte Carlo de alcanzarlo y de que el dinero dure. Cantidad ' +
        '(`targetAmount` + `targetYears`): reunir una cifra en un plazo, con la aportación ' +
        'necesaria por periodo y si se llega al ritmo actual. Ambos devuelven % conseguido, ' +
        'lo que falta y años estimados con la aportación y la rentabilidad indicadas. Si el ' +
        'usuario guardó un escenario de la calculadora FIRE (slug independencia-financiera ' +
        'en `list_saved_scenarios`), usa sus valores: `goalMode: "amount"` indica el modo ' +
        'cantidad. Los importes van en la divisa `display`. Solo lectura.',
      inputSchema: {
        annualExpenses: z.number().min(0).max(1e12).optional().describe('Modo FIRE: gasto anual deseado.'),
        withdrawalRate: z.number().min(0).max(100).optional().describe('Modo FIRE: tasa de retiro (habitual: 4).'),
        targetAmount: z
          .number()
          .min(0)
          .max(1e12)
          .optional()
          .describe('Modo cantidad: cifra a reunir. Excluye annualExpenses/withdrawalRate.'),
        targetYears: z
          .number()
          .int()
          .min(0)
          .max(FIRE_SEARCH_MAX_YEARS)
          .optional()
          .describe('Modo cantidad: plazo en años enteros.'),
        contribution: z.number().min(0).max(1e12).describe('Aportación por periodo.'),
        frequency: z.enum(FREQUENCY_VALUES).optional().describe('Frecuencia de la aportación (por defecto monthly).'),
        annualReturn: z.number().min(-99).max(100).describe('Rentabilidad anual REAL esperada, en base 100.'),
        volatility: z
          .number()
          .min(0)
          .max(MAX_VOLATILITY)
          .optional()
          .describe('Volatilidad anual en base 100, para la simulación Monte Carlo.'),
        retirementYears: z
          .number()
          .min(0)
          .max(MAX_RETIREMENT_YEARS)
          .optional()
          .describe('Años que debe durar el dinero, para la simulación Monte Carlo.'),
        display: z.enum(CURRENCY_VALUES).optional().describe('Divisa del objetivo y de la cartera (por defecto EUR).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({
      volatility,
      retirementYears,
      display,
      frequency,
      annualExpenses,
      withdrawalRate,
      targetAmount,
      targetYears,
      contribution,
      annualReturn,
    }) =>
      runner.run('get_fire_goal_progress', async () => {
        const resolved = resolveGoalTarget({ annualExpenses, withdrawalRate, targetAmount, targetYears });
        if ('error' in resolved) {
          throw new InvalidToolInputError(GOAL_TARGET_ERRORS[resolved.error]);
        }
        const currency = display ?? 'EUR';
        const { aggregate } = await deps.valuation.valuate(runner.userId, currency);
        const progress = {
          contribution,
          annualReturn,
          frequency: frequency ?? 'monthly',
          currentValue: aggregate.marketValue,
        } as const;
        const outcome = computeGoalProgress(resolved.target, progress);
        const header = {
          display: currency,
          // Cuántas posiciones entran en el valor actual: las que no tienen precio no cuentan.
          valuedPositions: aggregate.valued,
          totalPositions: aggregate.total,
        };
        const simulation =
          resolved.target.mode === 'fire' && volatility !== undefined && retirementYears !== undefined
            ? simulatePortfolioGoal({ ...progress, ...resolved.target, volatility, retirementYears })
            : undefined;
        // `mode` va primero a propósito: es el orden de claves que ve el cliente.
        const { mode, ...result } = outcome;
        return jsonResult({ mode, ...header, ...result, ...(simulation ? { simulation } : {}) });
      }),
  );

  server.registerTool(
    'list_saved_scenarios',
    {
      title: 'Escenarios guardados de las calculadoras',
      description:
        'Devuelve los escenarios que el usuario guardó en las calculadoras de la web (nombre, ' +
        'calculadora por su slug y valores introducidos), para reutilizarlos con `calculate` ' +
        'o con `get_fire_goal_progress`. Solo lectura.',
      inputSchema: {
        slug: z.string().max(64).optional().describe('Solo los de una calculadora (p. ej. independencia-financiera).'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ slug }) =>
      runner.run('list_saved_scenarios', async () => {
        const scenarios = await deps.scenarios.findAllByUser(runner.userId, slug);
        return jsonResult({ scenarios });
      }),
  );
}
