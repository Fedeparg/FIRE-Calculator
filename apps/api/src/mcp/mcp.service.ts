import { Inject, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildRealisedGainsReport } from '@sextante/core/fiscal/realised-gains';
import { BREAKDOWN_GROUPS, type BreakdownGroupBy } from '@sextante/core/portfolio-breakdown';
import { computeAmountGoal, computePortfolioGoal, simulatePortfolioGoal } from '@sextante/core/portfolio-goal';
import { FREQUENCIES, type Frequency } from '@sextante/core/projection';
import { MAX_YEARS } from '@sextante/core/calculators/fire';
import { MAX_RETIREMENT_YEARS, MAX_VOLATILITY } from '@sextante/core/calculators/fire-montecarlo';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { z } from 'zod';

import { SCOPE_PORTFOLIO_WRITE } from '../oauth/oauth.constants.js';
import {
  HISTORY_DEFAULT_DAYS,
  HISTORY_MAX_DAYS,
  PortfolioSnapshotsService,
} from '../portfolio/portfolio-snapshots.service.js';
import { PortfolioValuationService } from '../portfolio/portfolio-valuation.service.js';
import { SUPPORTED_CURRENCIES } from '../positions/dto/create-position.dto.js';
import { CombinePositionDto } from '../positions/dto/combine-position.dto.js';
import { CreatePositionDto } from '../positions/dto/create-position.dto.js';
import { CreatePositionLotDto } from '../positions/dto/create-position-lot.dto.js';
import { UpdatePositionDto } from '../positions/dto/update-position.dto.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import { PositionsService } from '../positions/positions.service.js';
import { INSTRUMENT_SEARCH, type InstrumentSearchProvider } from '../prices/instrument-search.js';
import { SavedScenariosService } from '../scenarios/saved-scenarios.service.js';
import { CALCULATOR_CATEGORIES, hasCalculator, listCalculators, runCalculator } from './calculator-tools.js';
import { McpAuditService } from './mcp-audit.service.js';
import { errorResult, jsonResult } from './mcp-results.js';

/**
 * Contexto de seguridad de una petición MCP, derivado del access token verificado. El
 * `userId` es lo que hace que toda tool devuelva SOLO los datos de su dueño (mismo principio
 * de aislamiento que `positions` con el JWT). Ver `_local/mcp-integracion.md`.
 */
export type McpContext = {
  userId: string;
  clientId: string;
  scopes: string[];
};

/** Lista de divisas como tupla mutable para `z.enum` (SUPPORTED_CURRENCIES es `as const`). */
const CURRENCY_VALUES = [...SUPPORTED_CURRENCIES] as [string, ...string[]];

/** Criterios de reparto como tupla para `z.enum`. */
const BREAKDOWN_VALUES = [...BREAKDOWN_GROUPS] as [BreakdownGroupBy, ...BreakdownGroupBy[]];

/** Frecuencias de aportación como tupla para `z.enum`. */
const FREQUENCY_VALUES = [...FREQUENCIES] as [Frequency, ...Frequency[]];

/**
 * Construye, por petición, el servidor MCP con las tools de Sextante. Se crea fresco con el
 * contexto del usuario autenticado para que las tools cierren sobre SU `userId` y nunca
 * puedan acceder a datos de otro. Las tools reutilizan los servicios existentes (sin duplicar
 * lógica de negocio) y, en escritura, los MISMOS DTOs que la API REST (sin drift de validación).
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
          'plusvalías realizadas por ejercicio para la declaración de la Renta, el reparto por ' +
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

    this.registerReadTools(server, ctx);
    this.registerAnalysisTools(server, ctx);
    this.registerWriteTools(server, ctx);
    this.registerCalculatorTools(server, ctx);
    return server;
  }

  /**
   * Calculadoras: dos tools genéricas sobre el registro de `calculator-tools.ts`. Son puras (sin
   * datos del usuario) y de solo lectura. Cada ejecución se audita como `calculate:<slug>`
   * (solo si el slug existe: la columna es de longitud fija y el slug lo escribe el cliente).
   */
  private registerCalculatorTools(server: McpServer, ctx: McpContext): void {
    server.registerTool(
      'list_calculators',
      {
        title: 'Calculadoras disponibles',
        description:
          'Lista las calculadoras de Sextante con su slug, categoría, descripción y el esquema ' +
          'de entrada (JSON Schema con unidades, mínimos y máximos de cada campo). Úsala antes ' +
          'de `calculate` para saber qué calculadora usar y qué `inputs` enviarle. Filtra por ' +
          '`category` o `slug`: sin filtro devuelve todas (unos 40 KB). Solo lectura.',
        inputSchema: {
          category: z.enum(CALCULATOR_CATEGORIES).optional().describe('Solo las de esta categoría.'),
          slug: z.string().max(64).optional().describe('Solo la de este slug.'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      ({ category, slug }) =>
        this.run(ctx, 'list_calculators', () =>
          Promise.resolve(jsonResult(listCalculators({ category, slug }), { compact: true })),
        ),
    );

    server.registerTool(
      'calculate',
      {
        title: 'Ejecutar una calculadora',
        description:
          'Ejecuta una calculadora de Sextante con el mismo motor que la web. `calculator` es el ' +
          'slug (ver `list_calculators`) e `inputs` un objeto que cumple el esquema de esa ' +
          'calculadora: un campo fuera de rango, de otro tipo o desconocido devuelve un error ' +
          'sin calcular. Los importes van en la divisa del usuario (las fiscales, en euros) y ' +
          'los porcentajes en base 100 (5 = 5 %). Solo cálculo, sin leer datos del usuario; es ' +
          'una estimación orientativa, no asesoramiento. Solo lectura.',
        inputSchema: {
          calculator: z.string().max(64).describe('Slug de la calculadora (p. ej. hipoteca-fija).'),
          inputs: z.record(z.string(), z.unknown()).describe('Entradas de la calculadora, según su esquema.'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      ({ calculator, inputs }) =>
        this.run(ctx, hasCalculator(calculator) ? `calculate:${calculator}` : 'calculate', () =>
          Promise.resolve(jsonResult(runCalculator(calculator, inputs))),
        ),
    );
  }

  /** Tools de solo lectura (scope `portfolio:read`). */
  private registerReadTools(server: McpServer, ctx: McpContext): void {
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
        this.run(ctx, 'list_positions', async () => {
          const positions = await this.positions.findAllByUser(ctx.userId);
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
        this.run(ctx, 'get_portfolio_valuation', async () => {
          const result = await this.valuation.valuate(ctx.userId, display ?? 'EUR');
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
        this.run(ctx, 'get_position', async () => {
          const position = await this.valuation.valuateOne(ctx.userId, id);
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
        this.run(ctx, 'search_instruments', async () => {
          // Mismo proveedor que usa `GET /api/instruments/search`: el LLM y la UI ven
          // exactamente los mismos resultados.
          const results = await this.instruments.search(query);
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
        this.run(ctx, 'get_portfolio_history', async () => {
          const history = await this.snapshots.history(ctx.userId, days, display);
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
        this.run(ctx, 'list_position_lots', async () => {
          const lots = await this.lots.listByPosition(ctx.userId, positionId);
          return jsonResult({ lots });
        }),
    );
  }

  /**
   * Tools de análisis de la cartera (scope `portfolio:read`): lo que la web calcula sobre los
   * datos del usuario, con las mismas funciones de `@sextante/core`.
   */
  private registerAnalysisTools(server: McpServer, ctx: McpContext): void {
    server.registerTool(
      'get_realised_gains',
      {
        title: 'Plusvalías realizadas por ejercicio (para la Renta)',
        description:
          'Ganancias y pérdidas patrimoniales de las ventas registradas, calculadas por FIFO ' +
          'como exige la normativa española y agrupadas por ejercicio fiscal y divisa: valor ' +
          'de transmisión, valor de adquisición (con comisiones) y resultado de cada venta, ' +
          'más una estimación de la cuota de la base del ahorro sobre lo vendido en euros. ' +
          'Las ventas en otra divisa se dan en esa divisa sin convertir (en la declaración se ' +
          'convierten al tipo de cambio de cada operación). Sirve para preparar las casillas ' +
          'de ganancias patrimoniales. Compensa las ventas del mismo ejercicio, pero NO ' +
          'aplica los saldos negativos de los cuatro ejercicios anteriores, la compensación ' +
          'del 25 % con dividendos e intereses ni la regla de los dos meses. Solo lectura.',
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
        this.run(ctx, 'get_realised_gains', async () => {
          const [positions, lots] = await Promise.all([
            this.positions.findAllByUser(ctx.userId),
            this.lots.findAllByUser(ctx.userId),
          ]);
          const lotsByPosition = new Map<string, typeof lots>();
          for (const lot of lots) {
            lotsByPosition.set(lot.positionId, [...(lotsByPosition.get(lot.positionId) ?? []), lot]);
          }
          const report = buildRealisedGainsReport(
            positions.map((p) => ({
              id: p.id,
              ticker: p.ticker,
              name: p.name,
              currency: p.currency,
              lots: lotsByPosition.get(p.id) ?? [],
            })),
          );
          const years = year === undefined ? report.years : report.years.filter((y) => y.year === year);
          return jsonResult({ years });
        }),
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
        this.run(ctx, 'get_portfolio_breakdown', async () =>
          jsonResult(await this.valuation.breakdown(ctx.userId, display ?? 'EUR', groupBy)),
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
            .max(MAX_YEARS)
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
          display: z
            .enum(CURRENCY_VALUES)
            .optional()
            .describe('Divisa del objetivo y de la cartera (por defecto EUR).'),
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
        this.run(ctx, 'get_fire_goal_progress', async () => {
          const amountMode = targetAmount !== undefined || targetYears !== undefined;
          if (amountMode && (targetAmount === undefined || targetYears === undefined)) {
            throw new InvalidToolInputError('el modo cantidad necesita targetAmount y targetYears');
          }
          if (amountMode && (annualExpenses !== undefined || withdrawalRate !== undefined)) {
            throw new InvalidToolInputError(
              'usa annualExpenses/withdrawalRate (modo FIRE) o targetAmount/targetYears (modo cantidad), no ambos',
            );
          }
          if (!amountMode && (annualExpenses === undefined || withdrawalRate === undefined)) {
            throw new InvalidToolInputError('el modo FIRE necesita annualExpenses y withdrawalRate');
          }
          const currency = display ?? 'EUR';
          const { aggregate } = await this.valuation.valuate(ctx.userId, currency);
          const common = {
            contribution,
            annualReturn,
            frequency: frequency ?? 'monthly',
            currentValue: aggregate.marketValue,
          } as const;
          const header = {
            display: currency,
            // Cuántas posiciones entran en el valor actual: las que no tienen precio no cuentan.
            valuedPositions: aggregate.valued,
            totalPositions: aggregate.total,
          };
          if (amountMode) {
            return jsonResult({
              mode: 'amount',
              ...header,
              ...computeAmountGoal({ ...common, targetAmount: targetAmount ?? 0, years: targetYears ?? 0 }),
            });
          }
          const input = { ...common, annualExpenses: annualExpenses ?? 0, withdrawalRate: withdrawalRate ?? 0 };
          const simulation =
            volatility !== undefined && retirementYears !== undefined
              ? simulatePortfolioGoal({ ...input, volatility, retirementYears })
              : undefined;
          return jsonResult({
            mode: 'fire',
            ...header,
            ...computePortfolioGoal(input),
            ...(simulation ? { simulation } : {}),
          });
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
          slug: z
            .string()
            .max(64)
            .optional()
            .describe('Solo los de una calculadora (p. ej. independencia-financiera).'),
        },
        annotations: { readOnlyHint: true },
      },
      ({ slug }) =>
        this.run(ctx, 'list_saved_scenarios', async () => {
          const scenarios = await this.scenarios.findAllByUser(ctx.userId, slug);
          return jsonResult({ scenarios });
        }),
    );
  }

  /**
   * Tools de escritura (scope `portfolio:write`). Se registran SIEMPRE (para que el host las
   * descubra), pero cada una verifica el scope en tiempo de ejecución: un token solo-lectura
   * recibe un error de tool pidiendo reconectar con permiso de escritura (step-up). No es un
   * 403 HTTP: todas las tools comparten el mismo endpoint, así que el control es por-tool.
   */
  private registerWriteTools(server: McpServer, ctx: McpContext): void {
    server.registerTool(
      'add_position',
      {
        title: 'Añadir una posición',
        description:
          'Crea una nueva posición en la cartera. Si ya existe el mismo símbolo, indica el ' +
          'bróker para distinguirla; si el (símbolo, bróker) exacto ya existe, usa ' +
          '`combine_position` en su lugar. Requiere permiso de escritura.',
        inputSchema: {
          ticker: z.string().min(1).max(20).describe('Símbolo (p. ej. "IWDA", "AAPL").'),
          name: z.string().max(100).optional().describe('Nombre legible (opcional).'),
          quantity: z.number().positive().describe('Número de participaciones/acciones.'),
          avgPrice: z.number().min(0).describe('Precio medio de compra.'),
          broker: z.string().max(100).optional().describe('Bróker (opcional).'),
          currency: z.enum(CURRENCY_VALUES).optional().describe('Divisa (por defecto EUR).'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      (args) =>
        this.runWrite(ctx, 'add_position', async () => {
          const dto = await this.validateDto(CreatePositionDto, args);
          const position = await this.positions.create(ctx.userId, dto);
          return jsonResult({ position });
        }),
    );

    server.registerTool(
      'update_position',
      {
        title: 'Editar una posición',
        description:
          'Actualiza los campos indicados de una posición existente (por id). Solo se cambian ' +
          'los campos enviados. Requiere permiso de escritura.',
        inputSchema: {
          id: z.string().min(1).describe('Id de la posición a editar.'),
          ticker: z.string().min(1).max(20).optional(),
          name: z.string().max(100).optional(),
          quantity: z.number().positive().optional(),
          avgPrice: z.number().min(0).optional(),
          broker: z.string().max(100).optional(),
          currency: z.enum(CURRENCY_VALUES).optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      ({ id, ...rest }) =>
        this.runWrite(ctx, 'update_position', async () => {
          const dto = await this.validateDto(UpdatePositionDto, rest);
          const position = await this.positions.update(ctx.userId, id, dto);
          return jsonResult({ position });
        }),
    );

    server.registerTool(
      'combine_position',
      {
        title: 'Combinar una compra con una posición existente',
        description:
          'Fusiona una nueva compra con una posición existente (por id) mediante media ' +
          'ponderada de cantidad y precio. La divisa debe coincidir con la de la posición. ' +
          'Requiere permiso de escritura.',
        inputSchema: {
          id: z.string().min(1).describe('Id de la posición existente.'),
          quantity: z.number().positive().describe('Cantidad de la nueva compra.'),
          avgPrice: z.number().min(0).describe('Precio de la nueva compra.'),
          currency: z.enum(CURRENCY_VALUES).optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      ({ id, ...rest }) =>
        this.runWrite(ctx, 'combine_position', async () => {
          const dto = await this.validateDto(CombinePositionDto, rest);
          const position = await this.positions.combine(ctx.userId, id, dto);
          return jsonResult({ position });
        }),
    );

    server.registerTool(
      'delete_position',
      {
        title: 'Borrar una posición',
        description:
          'Elimina una posición de la cartera (por id). Acción irreversible. Requiere permiso ' + 'de escritura.',
        inputSchema: {
          id: z.string().min(1).describe('Id de la posición a borrar.'),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      },
      ({ id }) =>
        this.runWrite(ctx, 'delete_position', async () => {
          await this.positions.remove(ctx.userId, id);
          return jsonResult({ deleted: true, id });
        }),
    );

    server.registerTool(
      'add_position_lot',
      {
        title: 'Registrar una compra o venta en una posición',
        description:
          'Añade una operación con su FECHA a una posición existente y recalcula su cantidad ' +
          'y precio medio (compras y ventas; el precio medio sigue el coste medio móvil, así ' +
          'que una venta baja la cantidad pero no lo mueve). Prefiere esta tool a ' +
          '`combine_position` cuando conozcas la fecha de la operación, y úsala para ' +
          'registrar ventas: es lo que construye el histórico. Una venta mayor que lo que se ' +
          'tiene se rechaza. Requiere permiso de escritura.',
        inputSchema: {
          positionId: z.string().min(1).describe('Id de la posición.'),
          kind: z.enum(['buy', 'sell']).describe('Tipo de operación: compra o venta.'),
          quantity: z.number().positive().describe('Cantidad operada.'),
          price: z.number().min(0).describe('Precio unitario de la operación.'),
          fees: z.number().min(0).optional().describe('Comisiones (opcional).'),
          tradedAt: z.string().describe('Fecha de la operación en formato YYYY-MM-DD.'),
          note: z.string().max(200).optional().describe('Nota libre (opcional).'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      ({ positionId, ...rest }) =>
        this.runWrite(ctx, 'add_position_lot', async () => {
          const dto = await this.validateDto(CreatePositionLotDto, rest);
          const lot = await this.lots.create(ctx.userId, positionId, dto);
          return jsonResult({ lot });
        }),
    );

    server.registerTool(
      'delete_position_lot',
      {
        title: 'Borrar una operación (lote) de una posición',
        description:
          'Elimina una operación registrada y recalcula la cantidad y el precio medio de la ' +
          'posición con las que queden. Acción irreversible: corrige errores de registro, no ' +
          'sirve para reflejar una venta (para eso, `add_position_lot` con kind "sell"). ' +
          'Requiere permiso de escritura.',
        inputSchema: {
          positionId: z.string().min(1).describe('Id de la posición.'),
          lotId: z.string().min(1).describe('Id del lote a borrar.'),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      },
      ({ positionId, lotId }) =>
        this.runWrite(ctx, 'delete_position_lot', async () => {
          await this.lots.remove(ctx.userId, positionId, lotId);
          return jsonResult({ deleted: true, lotId });
        }),
    );
  }

  /**
   * Ejecuta el cuerpo de una tool de LECTURA con auditoría. Los errores de dominio se
   * traducen a resultado de error de tool (no a un 500): el host los muestra al usuario.
   */
  private async run(ctx: McpContext, tool: string, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
      const result = await body();
      await this.audit.record(ctx.userId, ctx.clientId, tool, 'ok');
      return result;
    } catch (error) {
      await this.audit.record(ctx.userId, ctx.clientId, tool, 'error');
      return errorResult(toUserMessage(error));
    }
  }

  /**
   * Igual que `run` pero exige el scope de escritura ANTES de ejecutar (step-up por-tool). Un
   * token sin `portfolio:write` recibe un error claro y queda registrado como `denied_scope`.
   */
  private async runWrite(ctx: McpContext, tool: string, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
    if (!ctx.scopes.includes(SCOPE_PORTFOLIO_WRITE)) {
      await this.audit.record(ctx.userId, ctx.clientId, tool, 'denied_scope');
      return errorResult(
        'Esta acción requiere permiso de escritura (portfolio:write). Vuelve a conectar la ' +
          'aplicación concediendo acceso de escritura para poder modificar la cartera.',
      );
    }
    return this.run(ctx, tool, body);
  }

  /**
   * Valida la entrada de una tool de escritura con el MISMO DTO (class-validator) que usa la
   * API REST, de modo que el camino MCP no sea una vía de escritura más débil (divisa fuera de
   * la lista, cantidades negativas, etc.). Lanza con los mensajes de validación si falla.
   */
  private async validateDto<T extends object>(cls: new () => T, input: unknown): Promise<T> {
    const dto = plainToInstance(cls, input);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ');
      throw new InvalidToolInputError(messages || 'Entrada no válida');
    }
    return dto;
  }
}

/** Error de validación de entrada de tool (se traduce a resultado de error de tool). */
class InvalidToolInputError extends Error {}

/**
 * Convierte un error (de validación o de dominio de NestJS) en un mensaje legible para el
 * host MCP. Las `HttpException` de Nest llevan el detalle en `response` (string u objeto con
 * `message`/`code`); lo extraemos sin volcar trazas internas.
 */
function toUserMessage(error: unknown): string {
  if (error instanceof InvalidToolInputError) {
    return `Entrada no válida: ${error.message}`;
  }
  const response = (error as { response?: unknown })?.response;
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object') {
    const r = response as { message?: unknown; code?: unknown };
    const msg = Array.isArray(r.message) ? r.message.join('; ') : r.message;
    if (typeof msg === 'string') {
      const code = typeof r.code === 'string' || typeof r.code === 'number' ? r.code : undefined;
      return code !== undefined ? `${msg} (${code})` : msg;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Error al ejecutar la operación';
}
