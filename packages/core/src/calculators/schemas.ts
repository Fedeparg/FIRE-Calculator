import type { z } from "zod";

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
 * Registry of the Sextante calculators exposed over MCP through TWO generic tools
 * (`list_calculators` and `calculate`) instead of one tool per calculator. They run exactly the
 * same code as the website, so the assistant and the calculator cannot disagree on the figures.
 * They read no user data: they are pure functions over what the client sends. The key is the
 * website slug (the same one `list_saved_scenarios` returns).
 *
 * Each entry links its calculator's zod schema (`<module>.schema.ts`, with bounds on amounts,
 * rates, years and simulations) to its computation. Besides documenting units to the client
 * (it is published as JSON Schema in `list_calculators`), the bounds cap the work a single call
 * can ask of the server: the Monte Carlo runs here, not in the browser. Adding a calculator means
 * adding an entry to `CALCULATORS`.
 *
 * Server-only: it pulls in zod, so the frontend must not import it (enforced by an ESLint rule).
 */

export interface CalculatorEntry {
  readonly category: CalculatorCategory;
  readonly title: string;
  readonly description: string;
  /** Input schema. Strict: an unknown key is an error, not silently ignored. */
  readonly schema: z.ZodType;
  /** Validates the input against `schema` (throws `ZodError` if it does not conform) and computes. */
  readonly run: (input: unknown) => unknown;
}

const CURRENCY_NOTE =
  "Amounts are in the user's currency (the tax calculators, in euros). " +
  "Percentages are on a base of 100 (5 = 5%). Computation only, without reading user data; " +
  "it is an indicative estimate, not advice.";

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

/** Step for the yearly sampling of the credit-card series (which is monthly and may span 100 years). */
const MONTHS_PER_YEAR = 12;

/** Fixed-term deposit and interest-bearing account share the computation (TAE, i.e. APY) and schema. */
const DEPOSIT = defineCalculator(
  "ahorro",
  {
    title: "Fixed-term deposit or interest-bearing account",
    description:
      "Interest on a fixed-term deposit (depósito a plazo fijo) or an interest-bearing account (cuenta remunerada) " +
      "from its TAE (annual equivalent rate), gross and net of withholding tax, and the final value in today's purchasing power.",
    schema: depositSchema,
  },
  computeDeposit,
);

export const CALCULATORS: Readonly<Record<string, CalculatorEntry>> = {
  // --- Investing ------------------------------------------------------------------------------
  "interes-compuesto": defineCalculator(
    "inversion",
    {
      title: "Compound interest calculator",
      description:
        "Projects the growth of an investment with an initial capital and periodic contributions: " +
        "final value, total contributed, interest earned, real value after inflation and a " +
        "year-by-year series.",
      schema: compoundSchema,
    },
    computeCompound,
  ),
  "interes-simple": defineCalculator(
    "inversion",
    {
      title: "Simple interest calculator",
      description:
        "Interest on a principal at simple interest (not reinvested), gross and net of the " +
        "Spanish withholding tax on investment income (rendimientos del capital mobiliario).",
      schema: simpleInterestSchema,
    },
    computeSimpleInterest,
  ),
  "promediar-acciones": defineCalculator(
    "inversion",
    {
      title: "Average share price (weighted average cost)",
      description:
        "Weighted average price of several purchases of the same security (fees included) and, " +
        "if the current price is given, the position's value and gain/loss.",
      schema: averagePriceSchema,
    },
    computeAveragePrice,
  ),
  dividendos: defineCalculator(
    "inversion",
    {
      title: "Dividend calculator",
      description:
        "Dividend income gross and net of withholding tax, dividend yield and a " + "projection with dividend growth.",
      schema: dividendSchema,
    },
    computeDividends,
  ),
  roi: defineCalculator(
    "inversion",
    {
      title: "ROI calculator",
      description:
        "Return on a closed investment: ROI gross and net of costs and taxes and, given the years, " +
        "the annualised return (CAGR).",
      schema: roiSchema,
    },
    computeRoi,
  ),
  staking: defineCalculator(
    "inversion",
    {
      title: "Staking calculator (crypto)",
      description: "Return on staking crypto-assets at a compounded APY, gross and net of the " + "tax on the rewards.",
      schema: stakingSchema,
    },
    computeStaking,
  ),

  // --- FIRE and retirement --------------------------------------------------------------------
  "independencia-financiera": defineCalculator(
    "fire",
    {
      title: "Financial independence calculator (FIRE)",
      description:
        "FIRE number (annual spending / withdrawal rate) and years to reach it with the given savings " +
        "and REAL return, with a year-by-year series. For the probability of success with " +
        "volatility, use the `simulador-montecarlo` calculator; to measure the user's real portfolio " +
        "against the goal, `get_fire_goal_progress`.",
      schema: fireSchema,
    },
    computeFire,
  ),
  "simulador-montecarlo": defineCalculator(
    "fire",
    {
      title: "FIRE Monte Carlo simulator",
      description:
        "Simulates thousands of lifetimes with random returns (lognormal) or by resampling " +
        "US history since 1871 (Shiller) and returns the probability of reaching FIRE and " +
        "of the money lasting through retirement, the years to FIRE at the 10th/50th/90th " +
        "percentiles and the wealth path by percentile. The same seed gives a reproducible " +
        "result. Optionally, a sensitivity table for the withdrawal rate.",
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
      title: "Retirement savings calculator",
      description:
        "Estimated wealth at retirement age with the given monthly savings, in " +
        "nominal and real terms, with a year-by-year series.",
      schema: retirementSchema,
    },
    computeRetirement,
  ),
  "presupuesto-mensual": defineCalculator(
    "fire",
    {
      title: "Monthly budget (50/30/20 rule)",
      description:
        "Splits net monthly income into needs, wants and savings and compares them with " + "the 50/30/20 rule.",
      schema: budgetSchema,
    },
    computeBudget,
  ),

  // --- Mortgages and real estate --------------------------------------------------------------
  "hipoteca-fija": defineCalculator(
    "hipoteca",
    {
      title: "Fixed-rate mortgage",
      description:
        "Monthly payment (French amortisation system), total interest, TAE (annual equivalent rate) including the " +
        "opening fee and bundled products (vinculaciones), and a yearly amortisation schedule.",
      schema: mortgageSchema,
    },
    computeMortgage,
  ),
  "que-hipoteca-me-puedo-permitir": defineCalculator(
    "hipoteca",
    {
      title: "What mortgage can I afford?",
      description:
        "Maximum affordable home price and mortgage given income, debts, savings and debt-to-income " +
        "ratio (ratio de esfuerzo), stating which limit binds (monthly payment or down payment).",
      schema: affordabilitySchema,
    },
    computeAffordability,
  ),
  "hipoteca-vs-alquiler": defineCalculator(
    "hipoteca",
    {
      title: "Buying with a mortgage vs renting",
      description:
        "Compares the net worth of buying with a mortgage against renting and investing the " +
        "difference over the given horizon, with a year-by-year series.",
      schema: buyVsRentSchema,
    },
    computeBuyVsRent,
  ),
  "amortizacion-anticipada": defineCalculator(
    "hipoteca",
    {
      title: "Early mortgage repayment",
      description:
        "Compares an early repayment that lowers the monthly payment with one that shortens the term: new payment, term, " +
        "interest saved and net saving after the early repayment fee (comisión de amortización).",
      schema: earlyRepaymentSchema,
    },
    computeEarlyRepayment,
  ),
  "rentabilidad-alquiler": defineCalculator(
    "hipoteca",
    {
      title: "Rental yield",
      description:
        "Gross and net yield of a long-term rental property, accounting for vacancies, " +
        "IBI (property tax), community fees, insurance and maintenance.",
      schema: rentalYieldSchema,
    },
    computeRentalYield,
  ),
  "rentabilidad-alquiler-vacacional": defineCalculator(
    "hipoteca",
    {
      title: "Holiday rental yield",
      description:
        "Income, costs and net yield of a holiday rental given the nightly rate, " + "occupancy, fees and cleaning.",
      schema: holidayRentalSchema,
    },
    computeHolidayRental,
  ),

  // --- Savings --------------------------------------------------------------------------------
  "deposito-plazo-fijo": DEPOSIT,
  "cuenta-remunerada": DEPOSIT,

  // --- Taxes ----------------------------------------------------------------------------------
  "salario-bruto-neto": defineCalculator(
    "fiscalidad",
    {
      title: "Gross to net salary",
      description:
        "Estimates the annual and monthly net salary from the gross: Social Security " +
        "contributions, state and regional IRPF (Spanish income tax), and personal and family allowances (mínimos).",
      schema: netSalarySchema,
    },
    estimateNetSalary,
  ),
  "irpf-nomina": defineCalculator(
    "fiscalidad",
    {
      title: "IRPF payroll withholding",
      description:
        "IRPF (Spanish income tax) withholding rate that applies to the payroll and the monthly withholding, with the same " +
        "model as the net salary.",
      schema: netSalarySchema,
    },
    computePayrollWithholding,
  ),
  "irpf-autonomos": defineCalculator(
    "fiscalidad",
    {
      title: "IRPF for the self-employed (autónomos)",
      description:
        "Annual IRPF (Spanish income tax) of a self-employed worker under direct assessment (estimación directa, normal or simplified) from " +
        "income, expenses and the self-employed social security fee (cuota de autónomos), with net business income and effective rate.",
      schema: selfEmployedSchema,
    },
    computeSelfEmployedTax,
  ),
  "desgravacion-plan-pensiones": defineCalculator(
    "fiscalidad",
    {
      title: "Pension plan tax relief",
      description:
        "IRPF (Spanish income tax) saving from contributing to a pension plan given the gross salary and the " +
        "autonomous community, applying the legal limits on individual and employer contributions.",
      schema: pensionReliefSchema,
    },
    computePensionRelief,
  ),
  "impuesto-donaciones": defineCalculator(
    "fiscalidad",
    {
      title: "Gift tax (impuesto de donaciones)",
      description:
        "Tax due under the Inheritance and Gift Tax (Impuesto sobre Sucesiones y Donaciones, gift) with the state scale, the " +
        "multiplier for kinship and pre-existing wealth, and the given regional rebate (bonificación autonómica).",
      schema: giftTaxSchema,
    },
    computeGiftTax,
  ),
  "impuesto-patrimonio": defineCalculator(
    "fiscalidad",
    {
      title: "Wealth tax (impuesto sobre el patrimonio)",
      description:
        "Tax due under the Wealth Tax (Impuesto sobre el Patrimonio) with the state scale, the primary " +
        "residence exemption, the tax-free allowance (mínimo exento) and the given regional rebate (bonificación autonómica).",
      schema: wealthTaxSchema,
    },
    computeWealthTax,
  ),

  // --- Debt and tools -------------------------------------------------------------------------
  "intereses-tarjeta-credito": defineCalculator(
    "deuda",
    {
      title: "Credit card interest",
      description:
        "Months to pay off a card debt (fixed payment or a percentage of the balance, typical of " +
        "revolving credit), total interest and the balance at the end of each year. If the payment does not cover the " +
        "interest, monthsToPayoff is null and so are the totals (the debt is never paid off).",
      schema: creditCardSchema,
    },
    (args) => {
      const { series, ...result } = computeCreditCard(args);
      // The series is monthly (up to 1,200 points): the client only needs the balance at the end
      // of each year and in the last month.
      const yearly = series.filter(
        (point, index) => point.month % MONTHS_PER_YEAR === 0 || index === series.length - 1,
      );
      return { ...result, yearlySeries: yearly };
    },
  ),
  inflacion: defineCalculator(
    "herramientas",
    {
      title: "Inflation and purchasing power",
      description:
        "What an amount of today is worth in the future with the given inflation and how much purchasing " +
        "power is lost if the money sits idle or earns little, with a year-by-year series.",
      schema: inflationSchema,
    },
    computeInflation,
  ),
  "salud-financiera": defineCalculator(
    "herramientas",
    {
      title: "Financial health check",
      description:
        "Scores financial health from 0 to 100 with 8 weighted questions and returns a " +
        "category (critical, fragile, stable, strong). Each answer is an option from 0 (worst) " +
        "to 3 (best); missing ones count as 0. Options: emergencyFund (0 none, 1 <1 month " +
        "of expenses, 2 1–3 months, 3 >3 months); savingsRate (0 none, 1 <10%, 2 10–20%, " +
        "3 >20%); debt excluding the mortgage (0 expensive debt, 1 personal/car loan, 2 little and " +
        "under control, 3 none); housingCost as % of income (0 >50%, 1 35–50%, 2 25–35%, " +
        "3 <25%); investing (0 no, 1 getting started, 2 occasionally, 3 regularly and diversified); " +
        "retirement (0 nothing, 1 public pension only, 2 contributes sometimes, 3 plan with regular " +
        "contributions); protection (0 no insurance, 1 mandatory only, 2 some key insurance, 3 well " +
        "covered); tracking (0 does not know, 1 rough idea, 2 checks now and then, 3 monthly " +
        "budget).",
      schema: financialHealthSchema,
    },
    (args) => scoreFinancialHealthOptions(FINANCIAL_HEALTH_QUESTIONS.map((q) => args[q.id] ?? 0)),
  ),
};
