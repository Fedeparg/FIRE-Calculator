"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { CalculatorSlug } from "@/features/calculators/registry";

/**
 * Componente de cada calculadora, por slug. Una sola ruta (`calculadoras/[slug]`) sirve las 27:
 * `next/dynamic` en un componente de CLIENTE parte el JS por calculadora (desde un componente de
 * servidor no habría división automática, según la guía de lazy loading de Next) y mantiene el
 * SSR. `import()` tiene que ir escrito literalmente dentro de `dynamic()` para que Next lo enlace.
 *
 * Para añadir una calculadora: una línea aquí (además del registry, i18n y explainer). El tipo
 * `Record<CalculatorSlug, …>` hace que olvidarla (o dejar una de más) sea un error de compilación.
 */
export const CALCULATOR_COMPONENTS = {
  "ahorro-jubilacion": dynamic(() => import("./RetirementCalculator")),
  "amortizacion-anticipada": dynamic(() => import("./EarlyRepaymentCalculator")),
  "cuenta-remunerada": dynamic(() => import("./SavingsAccountCalculator")),
  "deposito-plazo-fijo": dynamic(() => import("./DepositCalculator")),
  "desgravacion-plan-pensiones": dynamic(() => import("./PensionReliefCalculator")),
  dividendos: dynamic(() => import("./DividendsCalculator")),
  "hipoteca-fija": dynamic(() => import("./MortgageCalculator")),
  "hipoteca-vs-alquiler": dynamic(() => import("./BuyVsRentCalculator")),
  "impuesto-donaciones": dynamic(() => import("./GiftTaxCalculator")),
  "impuesto-patrimonio": dynamic(() => import("./WealthTaxCalculator")),
  "independencia-financiera": dynamic(() => import("./FireCalculator")),
  inflacion: dynamic(() => import("./InflationCalculator")),
  "interes-compuesto": dynamic(() => import("./CompoundCalculator")),
  "interes-simple": dynamic(() => import("./SimpleInterestCalculator")),
  "intereses-tarjeta-credito": dynamic(() => import("./CreditCardCalculator")),
  "irpf-autonomos": dynamic(() => import("./SelfEmployedTaxCalculator")),
  "irpf-nomina": dynamic(() => import("./PayrollWithholdingCalculator")),
  "presupuesto-mensual": dynamic(() => import("./BudgetCalculator")),
  "promediar-acciones": dynamic(() => import("./AveragePriceCalculator")),
  "que-hipoteca-me-puedo-permitir": dynamic(() => import("./AffordabilityCalculator")),
  "rentabilidad-alquiler-vacacional": dynamic(() => import("./HolidayRentalCalculator")),
  "rentabilidad-alquiler": dynamic(() => import("./RentalYieldCalculator")),
  roi: dynamic(() => import("./RoiCalculator")),
  "salario-bruto-neto": dynamic(() => import("./NetSalaryCalculator")),
  "salud-financiera": dynamic(() => import("./FinancialHealthQuiz")),
  "simulador-montecarlo": dynamic(() => import("./MonteCarloCalculator")),
  staking: dynamic(() => import("./StakingCalculator")),
} satisfies Record<CalculatorSlug, ComponentType>;

export default function CalculatorBody({ slug }: { slug: CalculatorSlug }) {
  const Calculator = CALCULATOR_COMPONENTS[slug];
  return <Calculator />;
}
