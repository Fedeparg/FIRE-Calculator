import { z } from 'zod';

import { computeRetirement } from '@sextante/core/calculators/ahorro-jubilacion';
import { computeEarlyRepayment } from '@sextante/core/calculators/amortizacion-anticipada';
import type { CalculatorCategory } from '@sextante/core/calculators/categories';
import { computeDeposit } from '@sextante/core/calculators/deposito';
import { computePensionRelief } from '@sextante/core/calculators/desgravacion-plan-pensiones';
import { computeDividends } from '@sextante/core/calculators/dividendos';
import { computeFire } from '@sextante/core/calculators/fire';
import {
  DEFAULT_PATHS,
  MAX_RETIREMENT_YEARS,
  MAX_VOLATILITY,
  simulateFire,
  withdrawalSensitivity,
} from '@sextante/core/calculators/fire-montecarlo';
import { computeMortgage } from '@sextante/core/calculators/hipoteca';
import { computeAffordability } from '@sextante/core/calculators/hipoteca-asequible';
import { computeBuyVsRent } from '@sextante/core/calculators/hipoteca-vs-alquiler';
import { computeGiftTax, KINSHIP_GROUPS } from '@sextante/core/calculators/impuesto-donaciones';
import { computeWealthTax } from '@sextante/core/calculators/impuesto-patrimonio';
import { computeInflation } from '@sextante/core/calculators/inflacion';
import { computeCompound } from '@sextante/core/calculators/interes-compuesto';
import { computeSimpleInterest } from '@sextante/core/calculators/interes-simple';
import { computeSelfEmployedTax } from '@sextante/core/calculators/irpf-autonomos';
import { computePayrollWithholding } from '@sextante/core/calculators/irpf-nomina';
import { computeBudget } from '@sextante/core/calculators/presupuesto';
import { computeAveragePrice } from '@sextante/core/calculators/promediar-acciones';
import { computeRentalYield } from '@sextante/core/calculators/rentabilidad-alquiler';
import { computeHolidayRental } from '@sextante/core/calculators/rentabilidad-alquiler-vacacional';
import { computeRoi } from '@sextante/core/calculators/roi';
import {
  FINANCIAL_HEALTH_OPTIONS,
  FINANCIAL_HEALTH_QUESTIONS,
  scoreFinancialHealthOptions,
} from '@sextante/core/calculators/salud-financiera';
import { computeStaking } from '@sextante/core/calculators/staking';
import { computeCreditCard, PAYMENT_MODES } from '@sextante/core/calculators/tarjeta-credito';
import { CONTRACT_TYPES, DISABILITY_GRADES, estimateNetSalary } from '@sextante/core/fiscal/irpf';
import { REGION_CODES, type RegionCode } from '@sextante/core/fiscal/regions';
import { FREQUENCIES, type Frequency } from '@sextante/core/projection';

/**
 * Registro de las calculadoras de Sextante expuestas por MCP con DOS tools genéricas
 * (`list_calculators` y `calculate`, ver `McpService`), en vez de una tool por calculadora.
 * Ejecutan exactamente el mismo código que la web (`@sextante/core`), así que el asistente y la
 * calculadora no pueden dar cifras distintas. No leen datos del usuario: son funciones puras
 * sobre lo que el cliente envía. La clave es el slug de la web (el mismo que devuelve
 * `list_saved_scenarios`).
 *
 * Cada entrada declara su esquema zod con límites (importes, tasas, años, simulaciones). Además de
 * documentar las unidades al cliente (se publica como JSON Schema en `list_calculators`), los
 * límites acotan el trabajo que una llamada puede pedir al servidor: el Monte Carlo corre aquí,
 * no en el navegador. Añadir una calculadora es añadir una entrada a `CALCULATORS`.
 */

export interface CalculatorEntry {
  readonly category: CalculatorCategory;
  readonly title: string;
  readonly description: string;
  /** Esquema de entrada. Estricto: una clave desconocida es un error, no se ignora en silencio. */
  readonly schema: z.ZodType;
  /** Valida la entrada con `schema` (lanza `ZodError` si no cumple) y calcula. */
  readonly run: (input: unknown) => unknown;
}

const CURRENCY_NOTE =
  'Los importes van en la divisa que use el usuario (las calculadoras fiscales, en euros). ' +
  'Los porcentajes van en base 100 (5 = 5 %). Solo cálculo, sin leer datos del usuario; ' +
  'es una estimación orientativa, no asesoramiento.';

function defineCalculator<S extends z.ZodRawShape>(
  category: CalculatorCategory,
  config: { title: string; description: string; inputSchema: S },
  compute: (args: z.infer<z.ZodObject<S>>) => unknown,
): CalculatorEntry {
  const schema = z.strictObject(config.inputSchema);
  return {
    category,
    title: config.title,
    description: `${config.description} ${CURRENCY_NOTE}`,
    schema,
    run: (input) => compute(schema.parse(input)),
  };
}

// ---------------------------------------------------------------------------------------------
// Bloques de esquema. Los topes son holgados para cualquier caso real y evitan entradas
// absurdas (1e300 €, 10.000 años) que solo sirven para hacer trabajar al servidor.

const MAX_AMOUNT = 1e12;
/** Tope por defecto de los campos de plazo; los que necesitan otro lo pasan a `horizon`. */
const DEFAULT_MAX_HORIZON_YEARS = 100;

const amount = (description: string) => z.number().min(0).max(MAX_AMOUNT).describe(description);
const percent = (description: string, min = 0, max = 100) => z.number().min(min).max(max).describe(description);
const horizon = (description: string, max = DEFAULT_MAX_HORIZON_YEARS) =>
  z.number().min(0).max(max).describe(description);
const count = (description: string, max: number) => z.number().int().min(0).max(max).describe(description);

const frequency = z
  .enum(FREQUENCIES as [Frequency, ...Frequency[]])
  .optional()
  .describe('Frecuencia de las aportaciones (por defecto monthly).');

const region = z
  .enum(REGION_CODES as [RegionCode, ...RegionCode[]])
  .optional()
  .describe(
    'Comunidad autónoma (régimen común). Sin valor se aplica la escala autonómica supletoria. ' +
      'País Vasco, Navarra y Ceuta/Melilla no están soportados.',
  );

/** Circunstancias personales del IRPF, comunes a nómina, salario neto y autónomos. */
const personalCircumstances = {
  age: count('Edad del contribuyente (afecta al mínimo personal).', 120).optional(),
  contractType: z.enum(CONTRACT_TYPES).optional().describe('Tipo de contrato (cambia la cotización por desempleo).'),
  children: count('Hijos o descendientes a cargo.', 20).optional(),
  childrenUnder3: count('De esos hijos, cuántos tienen menos de 3 años.', 20).optional(),
  ascendants: count('Ascendientes mayores de 65 años a cargo.', 10).optional(),
  disability: z
    .enum(DISABILITY_GRADES)
    .optional()
    .describe('Grado de discapacidad del contribuyente: none, g33 (≥33 %) o g65 (≥65 %).'),
  jointReturn: z.boolean().optional().describe('Tributación conjunta (unidad familiar).'),
  region,
};

const netSalaryInput = {
  grossAnnual: amount('Salario bruto anual en euros.'),
  payments: z
    .union([z.literal(12), z.literal(14)])
    .optional()
    .describe('Número de pagas al año (12 o 14; por defecto 14).'),
  pensionContribution: amount('Aportación anual a plan de pensiones (reduce la base).').optional(),
  ...personalCircumstances,
};

/** Paso del muestreo anual de la serie de la tarjeta (que es mensual y puede durar 100 años). */
const MONTHS_PER_YEAR = 12;

// ---------------------------------------------------------------------------------------------

/** Depósito a plazo fijo y cuenta remunerada comparten cálculo (TAE) y esquema. */
const DEPOSIT = defineCalculator(
  'ahorro',
  {
    title: 'Depósito a plazo fijo o cuenta remunerada',
    description:
      'Intereses de un depósito a plazo fijo o de una cuenta remunerada a partir de la TAE, ' +
      'brutos y netos de la retención, y valor final en poder adquisitivo de hoy.',
    inputSchema: {
      principal: amount('Capital depositado.'),
      apr: percent('TAE.', 0, 50),
      years: horizon('Plazo en años (admite decimales: 0,5 = 6 meses).', 50),
      withholdingRate: percent('Retención sobre los intereses (por defecto 19 %).').optional(),
      inflationRate: percent('Inflación anual estimada.', -50, 100).optional(),
    },
  },
  (args) => computeDeposit(args),
);

export const CALCULATORS: Readonly<Record<string, CalculatorEntry>> = {
  // --- Inversión ------------------------------------------------------------------------------
  'interes-compuesto': defineCalculator(
    'inversion',
    {
      title: 'Calculadora de interés compuesto',
      description:
        'Proyecta el crecimiento de una inversión con capital inicial y aportaciones periódicas: ' +
        'valor final, total aportado, intereses generados, valor real descontando inflación y ' +
        'serie año a año.',
      inputSchema: {
        initial: amount('Capital inicial.'),
        contribution: amount('Importe de cada aportación.'),
        frequency,
        annualRate: percent('Rentabilidad anual esperada.', -99, 100),
        years: horizon('Horizonte en años.'),
        annualFee: percent('Comisión anual del producto (TER).').optional(),
        contributionGrowth: percent('Crecimiento anual de la aportación.', -100, 100).optional(),
        inflationRate: percent('Inflación anual estimada, para el valor real.', -50, 100).optional(),
      },
    },
    (args) => computeCompound(args),
  ),
  'interes-simple': defineCalculator(
    'inversion',
    {
      title: 'Calculadora de interés simple',
      description:
        'Intereses de un capital a interés simple (sin reinvertir), brutos y netos de la ' +
        'retención española sobre rendimientos del capital mobiliario.',
      inputSchema: {
        principal: amount('Capital inicial.'),
        annualRate: percent('Tipo de interés anual (TIN).'),
        years: horizon('Plazo en años.'),
        withholdingRate: percent('Retención sobre los intereses (por defecto 19 %).').optional(),
      },
    },
    (args) => computeSimpleInterest(args),
  ),
  'promediar-acciones': defineCalculator(
    'inversion',
    {
      title: 'Promediar acciones (precio medio ponderado)',
      description:
        'Precio medio ponderado de varias compras de un mismo valor (incluidas comisiones) y, ' +
        'si se da el precio actual, valor y ganancia/pérdida de la posición.',
      inputSchema: {
        purchases: z
          .array(
            z.object({
              price: amount('Precio por acción de la compra.'),
              shares: amount('Número de acciones (admite fracciones).'),
              commission: amount('Comisión de la compra.').optional(),
            }),
          )
          .min(1)
          .max(500)
          .describe('Compras realizadas.'),
        currentPrice: amount('Precio actual por acción (opcional).').optional(),
      },
    },
    (args) => computeAveragePrice(args),
  ),
  dividendos: defineCalculator(
    'inversion',
    {
      title: 'Calculadora de dividendos',
      description:
        'Ingresos por dividendos brutos y netos de retención, rentabilidad por dividendo y ' +
        'proyección con crecimiento del dividendo.',
      inputSchema: {
        shares: amount('Número de acciones.'),
        dividendPerShare: amount('Dividendo anual por acción.'),
        sharePrice: amount('Precio por acción, para la rentabilidad por dividendo.').optional(),
        withholdingRate: percent('Retención sobre los dividendos (por defecto 19 %).').optional(),
        annualGrowth: percent('Crecimiento anual del dividendo.', -100, 100).optional(),
        years: horizon('Horizonte de la proyección (0 = solo el primer año).').optional(),
      },
    },
    (args) => computeDividends(args),
  ),
  roi: defineCalculator(
    'inversion',
    {
      title: 'Calculadora de ROI',
      description:
        'Retorno de una inversión cerrada: ROI bruto y neto de costes e impuestos y, con años, ' +
        'rentabilidad anualizada (CAGR).',
      inputSchema: {
        initial: amount('Inversión inicial.'),
        final: amount('Valor final o importe recuperado.'),
        years: horizon('Horizonte en años, para anualizar.').optional(),
        costs: amount('Costes de la operación (comisiones, gastos).').optional(),
        income: amount('Rentas cobradas durante la inversión (dividendos, cupones…).').optional(),
        taxRate: percent('Impuesto sobre la ganancia (por defecto 19 %).').optional(),
      },
    },
    (args) => computeRoi(args),
  ),
  staking: defineCalculator(
    'inversion',
    {
      title: 'Calculadora de staking (cripto)',
      description:
        'Rendimiento del staking de criptoactivos con un APY compuesto, bruto y neto del ' +
        'impuesto sobre las recompensas.',
      inputSchema: {
        principal: amount('Capital inicial en staking.'),
        apy: percent('APY (rendimiento anual compuesto).', 0, 1000),
        years: horizon('Horizonte en años.'),
        withholdingRate: percent('Impuesto sobre las recompensas (por defecto 19 %).').optional(),
      },
    },
    (args) => computeStaking(args),
  ),

  // --- FIRE y jubilación ----------------------------------------------------------------------
  'independencia-financiera': defineCalculator(
    'fire',
    {
      title: 'Calculadora de independencia financiera (FIRE)',
      description:
        'Número FIRE (gasto anual / tasa de retiro) y años hasta alcanzarlo con el ahorro y la ' +
        'rentabilidad REAL indicados, con la serie año a año. Para la probabilidad de éxito con ' +
        'volatilidad usa `simulate_fire_monte_carlo`; para medir la cartera real del usuario ' +
        'contra el objetivo, `get_fire_goal_progress`.',
      inputSchema: {
        annualExpenses: amount('Gasto anual deseado una vez retirado.'),
        currentSavings: amount('Patrimonio invertido actual.'),
        savings: amount('Ahorro por periodo hasta alcanzar FIRE.'),
        frequency,
        annualReturn: percent('Rentabilidad anual REAL esperada.', -99, 100),
        withdrawalRate: percent('Tasa de retiro segura (habitual: 4).'),
        savingsGrowth: percent('Crecimiento anual del ahorro.', -100, 100).optional(),
      },
    },
    (args) => computeFire(args),
  ),
  'simulador-montecarlo': defineCalculator(
    'fire',
    {
      title: 'Simulador FIRE Monte Carlo',
      description:
        'Simula miles de vidas con rentabilidades aleatorias (lognormal) o remuestreando la ' +
        'historia de EE. UU. desde 1871 (Shiller) y devuelve la probabilidad de alcanzar FIRE y ' +
        'de que el dinero dure toda la jubilación, los años hasta FIRE en los percentiles ' +
        '10/50/90 y la evolución del patrimonio por percentiles. Con la misma semilla el ' +
        'resultado es reproducible. Opcionalmente, tabla de sensibilidad a la tasa de retiro.',
      inputSchema: {
        annualExpenses: amount('Gasto anual deseado una vez retirado.'),
        currentSavings: amount('Patrimonio invertido actual.'),
        monthlySavings: amount('Ahorro mensual hasta alcanzar FIRE.'),
        annualReturn: percent('Rentabilidad anual REAL media (modelo lognormal).', -99, 100),
        volatility: percent('Volatilidad anual (desviación típica).', 0, MAX_VOLATILITY),
        withdrawalRate: percent('Tasa de retiro segura (habitual: 4).'),
        retirementYears: horizon(
          'Años que el patrimonio debe sostener el gasto una vez retirado.',
          MAX_RETIREMENT_YEARS,
        ),
        historicalStockShare: percent(
          'Si se indica, usa rentabilidades históricas con este % en bolsa (el resto, bonos) ' +
            'en lugar del modelo lognormal; annualReturn y volatility se ignoran.',
        ).optional(),
        paths: z
          .number()
          .int()
          .min(100)
          .max(10_000)
          .optional()
          .describe(`Número de vidas simuladas (por defecto ${DEFAULT_PATHS}).`),
        seed: z.number().int().optional().describe('Semilla del generador aleatorio.'),
        includeSensitivity: z
          .boolean()
          .optional()
          .describe('Añade la probabilidad de éxito con tasas de retiro del 3 % al 5 %.'),
      },
    },
    ({ historicalStockShare, paths, seed, includeSensitivity, ...rest }) => {
      const input = {
        ...rest,
        returnModel:
          historicalStockShare === undefined
            ? ({ kind: 'lognormal' } as const)
            : ({ kind: 'historical', stockShare: historicalStockShare } as const),
      };
      const options = { paths, seed };
      return {
        ...simulateFire(input, options),
        ...(includeSensitivity ? { sensitivity: withdrawalSensitivity(input, undefined, options) } : {}),
      };
    },
  ),
  'ahorro-jubilacion': defineCalculator(
    'fire',
    {
      title: 'Calculadora de ahorro para la jubilación',
      description:
        'Patrimonio estimado a la edad de jubilación con el ahorro mensual indicado, en ' +
        'términos nominales y reales, con la serie año a año.',
      inputSchema: {
        currentAge: count('Edad actual.', 100),
        retirementAge: count('Edad de jubilación.', 100),
        currentSavings: amount('Patrimonio invertido actual.'),
        monthlySavings: amount('Aportación mensual hasta la jubilación.'),
        annualReturn: percent('Rentabilidad anual NOMINAL esperada.', -99, 100),
        inflationRate: percent('Inflación media anual.', -50, 100).optional(),
        annualFee: percent('Comisión anual del producto (TER).').optional(),
        contributionGrowth: percent('Crecimiento anual de la aportación.', -100, 100).optional(),
      },
    },
    (args) => computeRetirement(args),
  ),
  'presupuesto-mensual': defineCalculator(
    'fire',
    {
      title: 'Presupuesto mensual (regla 50/30/20)',
      description:
        'Reparte los ingresos netos mensuales en necesidades, deseos y ahorro y los compara con ' +
        'la regla 50/30/20.',
      inputSchema: {
        income: amount('Ingresos mensuales netos.'),
        needs: amount('Gasto mensual en necesidades (vivienda, comida, suministros…).'),
        wants: amount('Gasto mensual en deseos (ocio, caprichos…).'),
      },
    },
    (args) => computeBudget(args),
  ),

  // --- Hipoteca e inmuebles -------------------------------------------------------------------
  'hipoteca-fija': defineCalculator(
    'hipoteca',
    {
      title: 'Hipoteca a tipo fijo',
      description:
        'Cuota mensual (sistema francés), intereses totales, TAE con comisión de apertura y ' +
        'vinculaciones, y cuadro de amortización por años.',
      inputSchema: {
        principal: amount('Capital prestado.'),
        annualRate: percent('TIN anual.', 0, 50),
        years: horizon('Plazo en años.', 50),
        openingFeeRate: percent('Comisión de apertura, % del capital.', 0, 10).optional(),
        annualInsurance: amount('Coste anual de los productos vinculados.').optional(),
      },
    },
    (args) => computeMortgage(args),
  ),
  'que-hipoteca-me-puedo-permitir': defineCalculator(
    'hipoteca',
    {
      title: '¿Qué hipoteca me puedo permitir?',
      description:
        'Precio máximo de vivienda e hipoteca asumibles según ingresos, deudas, ahorro y ratio ' +
        'de esfuerzo, indicando qué límite manda (cuota o entrada).',
      inputSchema: {
        netMonthlyIncome: amount('Ingresos mensuales netos del hogar.'),
        monthlyDebts: amount('Otras cuotas mensuales de deuda.'),
        downPayment: amount('Ahorro disponible para la entrada y los gastos.'),
        annualRate: percent('TIN anual de la hipoteca.', 0, 50),
        termYears: horizon('Plazo en años.', 50),
        effortRatio: percent('Ratio de esfuerzo máximo (por defecto 35 %).').optional(),
        maxLtv: percent('% máximo del precio que financia el banco (por defecto 80 %).').optional(),
        purchaseCostsRate: percent('Gastos de compra, % del precio (por defecto 12 %).').optional(),
      },
    },
    (args) => computeAffordability(args),
  ),
  'hipoteca-vs-alquiler': defineCalculator(
    'hipoteca',
    {
      title: 'Hipoteca frente a alquiler',
      description:
        'Compara el patrimonio neto de comprar con hipoteca frente a alquilar e invertir la ' +
        'diferencia durante el horizonte indicado, con la serie año a año.',
      inputSchema: {
        purchasePrice: amount('Precio de compra.'),
        purchaseCosts: amount('Gastos e impuestos de compra.'),
        downPayment: amount('Entrada aportada.'),
        mortgageRate: percent('TIN de la hipoteca.', 0, 50),
        mortgageTerm: horizon('Plazo de la hipoteca en años.', 50),
        annualCostRate: percent('Gastos anuales de propiedad, % del precio (IBI, comunidad…).'),
        appreciationRate: percent('Revalorización anual del inmueble.', -50, 100),
        monthlyRent: amount('Alquiler mensual equivalente.'),
        rentGrowthRate: percent('Subida anual del alquiler.', -50, 100),
        investmentReturn: percent('Rentabilidad anual de invertir el capital libre.', -99, 100),
        horizonYears: horizon('Horizonte de comparación en años.', 60),
        sellingCostsRate: percent('Gastos de venta al final, % del valor.').optional(),
      },
    },
    (args) => computeBuyVsRent(args),
  ),
  'amortizacion-anticipada': defineCalculator(
    'hipoteca',
    {
      title: 'Amortización anticipada de hipoteca',
      description:
        'Compara amortizar reduciendo cuota o reduciendo plazo: nueva cuota, plazo, intereses ' +
        'ahorrados y ahorro neto tras la comisión de amortización.',
      inputSchema: {
        pendingPrincipal: amount('Capital pendiente.'),
        annualRate: percent('TIN anual.', 0, 50),
        remainingYears: horizon('Plazo restante en años.', 50),
        extraPayment: amount('Importe a amortizar.'),
        compensationRate: percent('Comisión por amortización, % de lo amortizado.', 0, 10).optional(),
      },
    },
    (args) => computeEarlyRepayment(args),
  ),
  'rentabilidad-alquiler': defineCalculator(
    'hipoteca',
    {
      title: 'Rentabilidad de un alquiler',
      description:
        'Rentabilidad bruta y neta de un inmueble en alquiler de larga estancia, con vacíos, ' +
        'IBI, comunidad, seguro y mantenimiento.',
      inputSchema: {
        purchasePrice: amount('Precio de compra.'),
        purchaseCosts: amount('Gastos e impuestos de compra.'),
        monthlyRent: amount('Alquiler mensual.'),
        vacancyRate: percent('Impago o meses vacíos, % del año (por defecto 5 %).').optional(),
        ibiAnnual: amount('IBI anual.').optional(),
        communityMonthly: amount('Cuota de comunidad mensual.').optional(),
        insuranceAnnual: amount('Seguro anual (hogar + impago).').optional(),
        maintenanceAnnual: amount('Mantenimiento anual.').optional(),
      },
    },
    (args) => computeRentalYield(args),
  ),
  'rentabilidad-alquiler-vacacional': defineCalculator(
    'hipoteca',
    {
      title: 'Rentabilidad de un alquiler vacacional',
      description:
        'Ingresos, gastos y rentabilidad neta de un alquiler turístico según precio por noche, ' +
        'ocupación, comisiones y limpiezas.',
      inputSchema: {
        purchasePrice: amount('Precio de compra.'),
        purchaseCosts: amount('Gastos e impuestos de compra.'),
        nightlyRate: amount('Precio medio por noche.'),
        occupiedNights: count('Noches ocupadas al año.', 366),
        managementRate: percent('Comisión de plataforma/gestión sobre ingresos.'),
        cleaningFee: amount('Coste de limpieza por estancia.').optional(),
        avgStayNights: z.number().min(1).max(366).optional().describe('Estancia media en noches (por defecto 3).'),
        annualExpenses: amount('Gastos fijos anuales (IBI, comunidad, seguro, suministros…).'),
      },
    },
    (args) => computeHolidayRental(args),
  ),

  // --- Ahorro ---------------------------------------------------------------------------------
  'deposito-plazo-fijo': DEPOSIT,
  'cuenta-remunerada': DEPOSIT,

  // --- Fiscalidad -----------------------------------------------------------------------------
  'salario-bruto-neto': defineCalculator(
    'fiscalidad',
    {
      title: 'Salario bruto a neto',
      description:
        'Estima el salario neto anual y mensual a partir del bruto: cotizaciones a la Seguridad ' +
        'Social, IRPF estatal y autonómico, mínimos personales y familiares.',
      inputSchema: netSalaryInput,
    },
    (args) => estimateNetSalary(args),
  ),
  'irpf-nomina': defineCalculator(
    'fiscalidad',
    {
      title: 'Retención de IRPF en nómina',
      description:
        'Tipo de retención de IRPF que corresponde en nómina y retención mensual, con el mismo ' +
        'modelo que el salario neto.',
      inputSchema: netSalaryInput,
    },
    (args) => computePayrollWithholding(args),
  ),
  'irpf-autonomos': defineCalculator(
    'fiscalidad',
    {
      title: 'IRPF de autónomos',
      description:
        'IRPF anual de un autónomo en estimación directa (normal o simplificada) a partir de ' +
        'ingresos, gastos y cuota de autónomos, con rendimiento neto y tipo efectivo.',
      inputSchema: {
        income: amount('Ingresos anuales de la actividad.'),
        expenses: amount('Gastos deducibles anuales (sin la cuota de autónomos).'),
        socialSecurity: amount('Cuota anual de autónomos.'),
        pensionContribution: amount('Aportación anual a plan de pensiones.').optional(),
        simplifiedRegime: z
          .boolean()
          .optional()
          .describe('Estimación directa simplificada (5 % de gastos de difícil justificación).'),
        ...personalCircumstances,
      },
    },
    (args) => computeSelfEmployedTax(args),
  ),
  'desgravacion-plan-pensiones': defineCalculator(
    'fiscalidad',
    {
      title: 'Desgravación del plan de pensiones',
      description:
        'Ahorro de IRPF por aportar a un plan de pensiones según el salario bruto y la ' +
        'comunidad, aplicando los límites legales de aportación individual y de empresa.',
      inputSchema: {
        grossAnnual: amount('Salario bruto anual.'),
        contribution: amount('Aportación anual individual.'),
        employerContribution: amount('Contribución anual de la empresa a un plan de empleo.').optional(),
        region,
      },
    },
    (args) => computePensionRelief(args),
  ),
  'impuesto-donaciones': defineCalculator(
    'fiscalidad',
    {
      title: 'Impuesto de donaciones',
      description:
        'Cuota del Impuesto sobre Sucesiones y Donaciones (donación) con la tarifa estatal, el ' +
        'coeficiente por parentesco y patrimonio previo y la bonificación autonómica indicada.',
      inputSchema: {
        amount: amount('Valor de lo donado.'),
        reduction: amount('Reducciones aplicables.').optional(),
        kinship: z
          .enum(KINSHIP_GROUPS)
          .optional()
          .describe(
            'Grupo de parentesco: grupoI_II (descendientes, cónyuge, ascendientes), grupoIII ' +
              '(hermanos, sobrinos, tíos, afines) o grupoIV (resto).',
          ),
        preexistingWealth: amount('Patrimonio previo del donatario.').optional(),
        regionalRebate: percent('Bonificación autonómica sobre la cuota.').optional(),
      },
    },
    (args) => computeGiftTax(args),
  ),
  'impuesto-patrimonio': defineCalculator(
    'fiscalidad',
    {
      title: 'Impuesto sobre el patrimonio',
      description:
        'Cuota del Impuesto sobre el Patrimonio con la tarifa estatal, la exención de la ' +
        'vivienda habitual, el mínimo exento y la bonificación autonómica indicada.',
      inputSchema: {
        totalWealth: amount('Patrimonio neto total (bienes y derechos menos deudas).'),
        primaryResidenceValue: amount('Valor de la vivienda habitual (exenta hasta 300.000 €).'),
        exemptMinimum: amount('Mínimo exento (por defecto 700.000 €).').optional(),
        regionalRebate: percent('Bonificación autonómica sobre la cuota.').optional(),
      },
    },
    (args) => computeWealthTax(args),
  ),

  // --- Deuda y herramientas -------------------------------------------------------------------
  'intereses-tarjeta-credito': defineCalculator(
    'deuda',
    {
      title: 'Intereses de tarjeta de crédito',
      description:
        'Meses hasta saldar una deuda de tarjeta (cuota fija o porcentaje del saldo, típico del ' +
        'revolving), intereses totales y saldo al final de cada año. Si el pago no cubre los ' +
        'intereses, monthsToPayoff es null y los totales también (la deuda no se salda nunca).',
      inputSchema: {
        balance: amount('Saldo pendiente.'),
        annualRate: percent('Tipo de interés anual.', 0, 100),
        paymentMode: z.enum(PAYMENT_MODES).optional().describe('fixed (cuota fija) o percent (% del saldo con suelo).'),
        monthlyPayment: amount('Pago mensual fijo (modo fixed).'),
        minPercent: percent('Cuota mínima, % del saldo (modo percent).').optional(),
        minFloor: amount('Suelo de la cuota mínima (modo percent).').optional(),
      },
    },
    (args) => {
      const { series, ...result } = computeCreditCard(args);
      // La serie es mensual (hasta 1.200 puntos): al cliente le basta el saldo al cierre de
      // cada año y el del último mes.
      const yearly = series.filter(
        (point, index) => point.month % MONTHS_PER_YEAR === 0 || index === series.length - 1,
      );
      return { ...result, yearlySeries: yearly };
    },
  ),
  inflacion: defineCalculator(
    'herramientas',
    {
      title: 'Inflación y poder adquisitivo',
      description:
        'Cuánto vale en el futuro un importe de hoy con la inflación indicada y cuánto poder ' +
        'adquisitivo se pierde si el dinero está parado o rinde poco, con la serie año a año.',
      inputSchema: {
        amount: amount('Importe de referencia (hoy).'),
        annualRate: percent('Inflación media anual.', -50, 100),
        years: horizon('Horizonte en años.'),
        nominalReturn: percent('Rentabilidad nominal del dinero (0 = parado).', -99, 100).optional(),
      },
    },
    (args) => computeInflation(args),
  ),
  'salud-financiera': defineCalculator(
    'herramientas',
    {
      title: 'Test de salud financiera',
      description:
        'Puntúa de 0 a 100 la salud financiera con 8 preguntas ponderadas y devuelve una ' +
        'categoría (critical, fragile, stable, strong). Cada respuesta es una opción de 0 (peor) ' +
        'a 3 (mejor); las que falten cuentan como 0. Opciones: emergencyFund (0 nada, 1 <1 mes ' +
        'de gastos, 2 1–3 meses, 3 >3 meses); savingsRate (0 nada, 1 <10 %, 2 10–20 %, ' +
        '3 >20 %); debt sin hipoteca (0 deuda cara, 1 préstamo personal/coche, 2 poca y ' +
        'controlada, 3 ninguna); housingCost % de ingresos (0 >50 %, 1 35–50 %, 2 25–35 %, ' +
        '3 <25 %); investing (0 no, 1 empezando, 2 puntual, 3 periódico y diversificado); ' +
        'retirement (0 nada, 1 solo pensión pública, 2 aporta a veces, 3 plan con aportación ' +
        'regular); protection (0 sin seguros, 1 solo obligatorios, 2 algún seguro clave, 3 bien ' +
        'cubierto); tracking (0 no sabe, 1 idea aproximada, 2 revisa a veces, 3 presupuesto ' +
        'mensual).',
      inputSchema: Object.fromEntries(
        FINANCIAL_HEALTH_QUESTIONS.map((q) => [
          q.id,
          z
            .number()
            .int()
            .min(0)
            .max(FINANCIAL_HEALTH_OPTIONS - 1)
            .optional()
            .describe(`Respuesta a ${q.id} (0–${FINANCIAL_HEALTH_OPTIONS - 1}).`),
        ]),
      ),
    },
    (args) => scoreFinancialHealthOptions(FINANCIAL_HEALTH_QUESTIONS.map((q) => args[q.id] ?? 0)),
  ),
};

/** Calculadora cuyo slug no existe (se traduce a error de tool con la lista de válidos). */
export class UnknownCalculatorError extends Error {
  constructor(slug: string) {
    super(`Calculadora desconocida: "${slug}". Usa list_calculators para ver los slugs disponibles.`);
  }
}

export interface CalculatorListing {
  slug: string;
  category: CalculatorCategory;
  title: string;
  description: string;
  /** JSON Schema de `inputs` (tipos, mínimos, máximos y descripción con unidades de cada campo). */
  inputSchema: unknown;
}

/** Un slug es válido solo si es una clave propia (evita `__proto__`, `constructor`, etc.). */
function findCalculator(slug: string): CalculatorEntry | undefined {
  return Object.hasOwn(CALCULATORS, slug) ? CALCULATORS[slug] : undefined;
}

/** Esquema JSON de cada calculadora, derivado del zod una sola vez (los esquemas son estáticos). */
const listingCache = new Map<string, CalculatorListing>();

function toListing(slug: string, entry: CalculatorEntry): CalculatorListing {
  let listing = listingCache.get(slug);
  if (!listing) {
    const inputSchema = z.toJSONSchema(entry.schema, { io: 'input' });
    delete inputSchema.$schema; // ruido: el borrador de JSON Schema ya lo sabe el cliente
    listing = { slug, category: entry.category, title: entry.title, description: entry.description, inputSchema };
    listingCache.set(slug, listing);
  }
  return listing;
}

/** Catálogo para `list_calculators`: todas, o las de una categoría / un slug. */
export function listCalculators(filter: { category?: CalculatorCategory; slug?: string } = {}): CalculatorListing[] {
  return Object.entries(CALCULATORS)
    .filter(
      ([slug, entry]) =>
        (!filter.slug || slug === filter.slug) && (!filter.category || entry.category === filter.category),
    )
    .map(([slug, entry]) => toListing(slug, entry));
}

/** Resumen legible de los errores de validación de zod, sin volcar el JSON interno. */
function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'inputs'}: ${issue.message}`).join('; ');
}

/**
 * Valida `inputs` con el esquema de ESA calculadora y calcula. Lanza `UnknownCalculatorError` si
 * el slug no existe y un `Error` con los campos inválidos si la entrada no cumple el esquema
 * (fuera de rango, de otro tipo o desconocida): en ambos casos no se calcula nada.
 */
export function runCalculator(slug: string, inputs: unknown): unknown {
  const entry = findCalculator(slug);
  if (!entry) throw new UnknownCalculatorError(slug);
  try {
    return entry.run(inputs);
  } catch (error) {
    if (error instanceof z.ZodError) throw new Error(`Entrada no válida para ${slug}: ${describeIssues(error)}`);
    throw error;
  }
}

/** ¿Existe la calculadora? Para auditar solo slugs conocidos (la columna es de longitud fija). */
export function hasCalculator(slug: string): boolean {
  return findCalculator(slug) !== undefined;
}
