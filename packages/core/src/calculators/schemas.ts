import { z } from "zod";

import { estimateNetSalary } from "../fiscal/irpf.js";
import { computeRetirement } from "./ahorro-jubilacion.js";
import { retirementSchema } from "./ahorro-jubilacion.schema.js";
import { computeEarlyRepayment } from "./amortizacion-anticipada.js";
import { earlyRepaymentSchema } from "./amortizacion-anticipada.schema.js";
import type { CalculatorCategory } from "./categories.js";
import { computeDeposit } from "./deposito.js";
import { depositSchema } from "./deposito.schema.js";
import { computePensionRelief } from "./desgravacion-plan-pensiones.js";
import { pensionReliefSchema } from "./desgravacion-plan-pensiones.schema.js";
import { computeDividends } from "./dividendos.js";
import { dividendSchema } from "./dividendos.schema.js";
import { computeFire } from "./fire.js";
import { simulateFire, withdrawalSensitivity } from "./fire-montecarlo.js";
import { monteCarloSchema } from "./fire-montecarlo.schema.js";
import { fireSchema } from "./fire.schema.js";
import { computeMortgage } from "./hipoteca.js";
import { computeAffordability } from "./hipoteca-asequible.js";
import { affordabilitySchema } from "./hipoteca-asequible.schema.js";
import { computeBuyVsRent } from "./hipoteca-vs-alquiler.js";
import { buyVsRentSchema } from "./hipoteca-vs-alquiler.schema.js";
import { mortgageSchema } from "./hipoteca.schema.js";
import { computeGiftTax } from "./impuesto-donaciones.js";
import { giftTaxSchema } from "./impuesto-donaciones.schema.js";
import { computeWealthTax } from "./impuesto-patrimonio.js";
import { wealthTaxSchema } from "./impuesto-patrimonio.schema.js";
import { computeInflation } from "./inflacion.js";
import { inflationSchema } from "./inflacion.schema.js";
import { computeCompound } from "./interes-compuesto.js";
import { compoundSchema } from "./interes-compuesto.schema.js";
import { computeSimpleInterest } from "./interes-simple.js";
import { simpleInterestSchema } from "./interes-simple.schema.js";
import { computeSelfEmployedTax } from "./irpf-autonomos.js";
import { selfEmployedSchema } from "./irpf-autonomos.schema.js";
import { computePayrollWithholding } from "./irpf-nomina.js";
import { computeBudget } from "./presupuesto.js";
import { budgetSchema } from "./presupuesto.schema.js";
import { computeAveragePrice } from "./promediar-acciones.js";
import { averagePriceSchema } from "./promediar-acciones.schema.js";
import { computeRentalYield } from "./rentabilidad-alquiler.js";
import { computeHolidayRental } from "./rentabilidad-alquiler-vacacional.js";
import { holidayRentalSchema } from "./rentabilidad-alquiler-vacacional.schema.js";
import { rentalYieldSchema } from "./rentabilidad-alquiler.schema.js";
import { computeRoi } from "./roi.js";
import { roiSchema } from "./roi.schema.js";
import { FINANCIAL_HEALTH_QUESTIONS, scoreFinancialHealthOptions } from "./salud-financiera.js";
import { financialHealthSchema } from "./salud-financiera.schema.js";
import { netSalarySchema } from "./salario-bruto-neto.schema.js";
import { computeStaking } from "./staking.js";
import { stakingSchema } from "./staking.schema.js";
import { computeCreditCard } from "./tarjeta-credito.js";
import { creditCardSchema } from "./tarjeta-credito.schema.js";

/**
 * Registro de las calculadoras de Sextante expuestas por MCP con DOS tools genéricas
 * (`list_calculators` y `calculate`), en vez de una tool por calculadora. Ejecutan exactamente el
 * mismo código que la web, así que el asistente y la calculadora no pueden dar cifras distintas.
 * No leen datos del usuario: son funciones puras sobre lo que el cliente envía. La clave es el
 * slug de la web (el mismo que devuelve `list_saved_scenarios`).
 *
 * Cada entrada enlaza el esquema zod de su calculadora (`<módulo>.schema.ts`, con límites de
 * importes, tasas, años y simulaciones) con su cálculo. Además de documentar las unidades al
 * cliente (se publica como JSON Schema en `list_calculators`), los límites acotan el trabajo que
 * una llamada puede pedir al servidor: el Monte Carlo corre aquí, no en el navegador. Añadir una
 * calculadora es añadir una entrada a `CALCULATORS`.
 *
 * Solo para el servidor: arrastra zod, así que el frontend no debe importarlo (regla de ESLint).
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
  "Los importes van en la divisa que use el usuario (las calculadoras fiscales, en euros). " +
  "Los porcentajes van en base 100 (5 = 5 %). Solo cálculo, sin leer datos del usuario; " +
  "es una estimación orientativa, no asesoramiento.";

function defineCalculator<S extends z.ZodType>(
  category: CalculatorCategory,
  config: { title: string; description: string; schema: S },
  compute: (args: z.infer<S>) => unknown,
): CalculatorEntry {
  return {
    category,
    title: config.title,
    description: `${config.description} ${CURRENCY_NOTE}`,
    schema: config.schema,
    run: (input) => compute(config.schema.parse(input)),
  };
}

/** Paso del muestreo anual de la serie de la tarjeta (que es mensual y puede durar 100 años). */
const MONTHS_PER_YEAR = 12;

/** Depósito a plazo fijo y cuenta remunerada comparten cálculo (TAE) y esquema. */
const DEPOSIT = defineCalculator(
  "ahorro",
  {
    title: "Depósito a plazo fijo o cuenta remunerada",
    description:
      "Intereses de un depósito a plazo fijo o de una cuenta remunerada a partir de la TAE, " +
      "brutos y netos de la retención, y valor final en poder adquisitivo de hoy.",
    schema: depositSchema,
  },
  (args) => computeDeposit(args),
);

export const CALCULATORS: Readonly<Record<string, CalculatorEntry>> = {
  // --- Inversión ------------------------------------------------------------------------------
  "interes-compuesto": defineCalculator(
    "inversion",
    {
      title: "Calculadora de interés compuesto",
      description:
        "Proyecta el crecimiento de una inversión con capital inicial y aportaciones periódicas: " +
        "valor final, total aportado, intereses generados, valor real descontando inflación y " +
        "serie año a año.",
      schema: compoundSchema,
    },
    (args) => computeCompound(args),
  ),
  "interes-simple": defineCalculator(
    "inversion",
    {
      title: "Calculadora de interés simple",
      description:
        "Intereses de un capital a interés simple (sin reinvertir), brutos y netos de la " +
        "retención española sobre rendimientos del capital mobiliario.",
      schema: simpleInterestSchema,
    },
    (args) => computeSimpleInterest(args),
  ),
  "promediar-acciones": defineCalculator(
    "inversion",
    {
      title: "Promediar acciones (precio medio ponderado)",
      description:
        "Precio medio ponderado de varias compras de un mismo valor (incluidas comisiones) y, " +
        "si se da el precio actual, valor y ganancia/pérdida de la posición.",
      schema: averagePriceSchema,
    },
    (args) => computeAveragePrice(args),
  ),
  dividendos: defineCalculator(
    "inversion",
    {
      title: "Calculadora de dividendos",
      description:
        "Ingresos por dividendos brutos y netos de retención, rentabilidad por dividendo y " +
        "proyección con crecimiento del dividendo.",
      schema: dividendSchema,
    },
    (args) => computeDividends(args),
  ),
  roi: defineCalculator(
    "inversion",
    {
      title: "Calculadora de ROI",
      description:
        "Retorno de una inversión cerrada: ROI bruto y neto de costes e impuestos y, con años, " +
        "rentabilidad anualizada (CAGR).",
      schema: roiSchema,
    },
    (args) => computeRoi(args),
  ),
  staking: defineCalculator(
    "inversion",
    {
      title: "Calculadora de staking (cripto)",
      description:
        "Rendimiento del staking de criptoactivos con un APY compuesto, bruto y neto del " +
        "impuesto sobre las recompensas.",
      schema: stakingSchema,
    },
    (args) => computeStaking(args),
  ),

  // --- FIRE y jubilación ----------------------------------------------------------------------
  "independencia-financiera": defineCalculator(
    "fire",
    {
      title: "Calculadora de independencia financiera (FIRE)",
      description:
        "Número FIRE (gasto anual / tasa de retiro) y años hasta alcanzarlo con el ahorro y la " +
        "rentabilidad REAL indicados, con la serie año a año. Para la probabilidad de éxito con " +
        "volatilidad usa `simulate_fire_monte_carlo`; para medir la cartera real del usuario " +
        "contra el objetivo, `get_fire_goal_progress`.",
      schema: fireSchema,
    },
    (args) => computeFire(args),
  ),
  "simulador-montecarlo": defineCalculator(
    "fire",
    {
      title: "Simulador FIRE Monte Carlo",
      description:
        "Simula miles de vidas con rentabilidades aleatorias (lognormal) o remuestreando la " +
        "historia de EE. UU. desde 1871 (Shiller) y devuelve la probabilidad de alcanzar FIRE y " +
        "de que el dinero dure toda la jubilación, los años hasta FIRE en los percentiles " +
        "10/50/90 y la evolución del patrimonio por percentiles. Con la misma semilla el " +
        "resultado es reproducible. Opcionalmente, tabla de sensibilidad a la tasa de retiro.",
      schema: monteCarloSchema,
    },
    ({ historicalStockShare, paths, seed, includeSensitivity, ...rest }) => {
      const input = {
        ...rest,
        returnModel:
          historicalStockShare === undefined
            ? ({ kind: "lognormal" } as const)
            : ({ kind: "historical", stockShare: historicalStockShare } as const),
      };
      const options = { paths, seed };
      return {
        ...simulateFire(input, options),
        ...(includeSensitivity ? { sensitivity: withdrawalSensitivity(input, undefined, options) } : {}),
      };
    },
  ),
  "ahorro-jubilacion": defineCalculator(
    "fire",
    {
      title: "Calculadora de ahorro para la jubilación",
      description:
        "Patrimonio estimado a la edad de jubilación con el ahorro mensual indicado, en " +
        "términos nominales y reales, con la serie año a año.",
      schema: retirementSchema,
    },
    (args) => computeRetirement(args),
  ),
  "presupuesto-mensual": defineCalculator(
    "fire",
    {
      title: "Presupuesto mensual (regla 50/30/20)",
      description:
        "Reparte los ingresos netos mensuales en necesidades, deseos y ahorro y los compara con " +
        "la regla 50/30/20.",
      schema: budgetSchema,
    },
    (args) => computeBudget(args),
  ),

  // --- Hipoteca e inmuebles -------------------------------------------------------------------
  "hipoteca-fija": defineCalculator(
    "hipoteca",
    {
      title: "Hipoteca a tipo fijo",
      description:
        "Cuota mensual (sistema francés), intereses totales, TAE con comisión de apertura y " +
        "vinculaciones, y cuadro de amortización por años.",
      schema: mortgageSchema,
    },
    (args) => computeMortgage(args),
  ),
  "que-hipoteca-me-puedo-permitir": defineCalculator(
    "hipoteca",
    {
      title: "¿Qué hipoteca me puedo permitir?",
      description:
        "Precio máximo de vivienda e hipoteca asumibles según ingresos, deudas, ahorro y ratio " +
        "de esfuerzo, indicando qué límite manda (cuota o entrada).",
      schema: affordabilitySchema,
    },
    (args) => computeAffordability(args),
  ),
  "hipoteca-vs-alquiler": defineCalculator(
    "hipoteca",
    {
      title: "Hipoteca frente a alquiler",
      description:
        "Compara el patrimonio neto de comprar con hipoteca frente a alquilar e invertir la " +
        "diferencia durante el horizonte indicado, con la serie año a año.",
      schema: buyVsRentSchema,
    },
    (args) => computeBuyVsRent(args),
  ),
  "amortizacion-anticipada": defineCalculator(
    "hipoteca",
    {
      title: "Amortización anticipada de hipoteca",
      description:
        "Compara amortizar reduciendo cuota o reduciendo plazo: nueva cuota, plazo, intereses " +
        "ahorrados y ahorro neto tras la comisión de amortización.",
      schema: earlyRepaymentSchema,
    },
    (args) => computeEarlyRepayment(args),
  ),
  "rentabilidad-alquiler": defineCalculator(
    "hipoteca",
    {
      title: "Rentabilidad de un alquiler",
      description:
        "Rentabilidad bruta y neta de un inmueble en alquiler de larga estancia, con vacíos, " +
        "IBI, comunidad, seguro y mantenimiento.",
      schema: rentalYieldSchema,
    },
    (args) => computeRentalYield(args),
  ),
  "rentabilidad-alquiler-vacacional": defineCalculator(
    "hipoteca",
    {
      title: "Rentabilidad de un alquiler vacacional",
      description:
        "Ingresos, gastos y rentabilidad neta de un alquiler turístico según precio por noche, " +
        "ocupación, comisiones y limpiezas.",
      schema: holidayRentalSchema,
    },
    (args) => computeHolidayRental(args),
  ),

  // --- Ahorro ---------------------------------------------------------------------------------
  "deposito-plazo-fijo": DEPOSIT,
  "cuenta-remunerada": DEPOSIT,

  // --- Fiscalidad -----------------------------------------------------------------------------
  "salario-bruto-neto": defineCalculator(
    "fiscalidad",
    {
      title: "Salario bruto a neto",
      description:
        "Estima el salario neto anual y mensual a partir del bruto: cotizaciones a la Seguridad " +
        "Social, IRPF estatal y autonómico, mínimos personales y familiares.",
      schema: netSalarySchema,
    },
    (args) => estimateNetSalary(args),
  ),
  "irpf-nomina": defineCalculator(
    "fiscalidad",
    {
      title: "Retención de IRPF en nómina",
      description:
        "Tipo de retención de IRPF que corresponde en nómina y retención mensual, con el mismo " +
        "modelo que el salario neto.",
      schema: netSalarySchema,
    },
    (args) => computePayrollWithholding(args),
  ),
  "irpf-autonomos": defineCalculator(
    "fiscalidad",
    {
      title: "IRPF de autónomos",
      description:
        "IRPF anual de un autónomo en estimación directa (normal o simplificada) a partir de " +
        "ingresos, gastos y cuota de autónomos, con rendimiento neto y tipo efectivo.",
      schema: selfEmployedSchema,
    },
    (args) => computeSelfEmployedTax(args),
  ),
  "desgravacion-plan-pensiones": defineCalculator(
    "fiscalidad",
    {
      title: "Desgravación del plan de pensiones",
      description:
        "Ahorro de IRPF por aportar a un plan de pensiones según el salario bruto y la " +
        "comunidad, aplicando los límites legales de aportación individual y de empresa.",
      schema: pensionReliefSchema,
    },
    (args) => computePensionRelief(args),
  ),
  "impuesto-donaciones": defineCalculator(
    "fiscalidad",
    {
      title: "Impuesto de donaciones",
      description:
        "Cuota del Impuesto sobre Sucesiones y Donaciones (donación) con la tarifa estatal, el " +
        "coeficiente por parentesco y patrimonio previo y la bonificación autonómica indicada.",
      schema: giftTaxSchema,
    },
    (args) => computeGiftTax(args),
  ),
  "impuesto-patrimonio": defineCalculator(
    "fiscalidad",
    {
      title: "Impuesto sobre el patrimonio",
      description:
        "Cuota del Impuesto sobre el Patrimonio con la tarifa estatal, la exención de la " +
        "vivienda habitual, el mínimo exento y la bonificación autonómica indicada.",
      schema: wealthTaxSchema,
    },
    (args) => computeWealthTax(args),
  ),

  // --- Deuda y herramientas -------------------------------------------------------------------
  "intereses-tarjeta-credito": defineCalculator(
    "deuda",
    {
      title: "Intereses de tarjeta de crédito",
      description:
        "Meses hasta saldar una deuda de tarjeta (cuota fija o porcentaje del saldo, típico del " +
        "revolving), intereses totales y saldo al final de cada año. Si el pago no cubre los " +
        "intereses, monthsToPayoff es null y los totales también (la deuda no se salda nunca).",
      schema: creditCardSchema,
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
    "herramientas",
    {
      title: "Inflación y poder adquisitivo",
      description:
        "Cuánto vale en el futuro un importe de hoy con la inflación indicada y cuánto poder " +
        "adquisitivo se pierde si el dinero está parado o rinde poco, con la serie año a año.",
      schema: inflationSchema,
    },
    (args) => computeInflation(args),
  ),
  "salud-financiera": defineCalculator(
    "herramientas",
    {
      title: "Test de salud financiera",
      description:
        "Puntúa de 0 a 100 la salud financiera con 8 preguntas ponderadas y devuelve una " +
        "categoría (critical, fragile, stable, strong). Cada respuesta es una opción de 0 (peor) " +
        "a 3 (mejor); las que falten cuentan como 0. Opciones: emergencyFund (0 nada, 1 <1 mes " +
        "de gastos, 2 1–3 meses, 3 >3 meses); savingsRate (0 nada, 1 <10 %, 2 10–20 %, " +
        "3 >20 %); debt sin hipoteca (0 deuda cara, 1 préstamo personal/coche, 2 poca y " +
        "controlada, 3 ninguna); housingCost % de ingresos (0 >50 %, 1 35–50 %, 2 25–35 %, " +
        "3 <25 %); investing (0 no, 1 empezando, 2 puntual, 3 periódico y diversificado); " +
        "retirement (0 nada, 1 solo pensión pública, 2 aporta a veces, 3 plan con aportación " +
        "regular); protection (0 sin seguros, 1 solo obligatorios, 2 algún seguro clave, 3 bien " +
        "cubierto); tracking (0 no sabe, 1 idea aproximada, 2 revisa a veces, 3 presupuesto " +
        "mensual).",
      schema: financialHealthSchema,
    },
    (args) => scoreFinancialHealthOptions(FINANCIAL_HEALTH_QUESTIONS.map((q) => args[q.id] ?? 0)),
  ),
};
