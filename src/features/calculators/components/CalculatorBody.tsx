"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { CalculatorSlug } from "@/features/calculators/registry";

/**
 * Component for each calculator, by slug. A single route (`calculadoras/[slug]`) serves all 27:
 * `next/dynamic` in a CLIENT component splits the JS per calculator (a server component would get
 * no automatic splitting, per Next's lazy-loading guide) and keeps SSR. `import()` must be written
 * literally inside `dynamic()` for Next to link it.
 *
 * To add a calculator: one line here (plus the registry, i18n and explainer). The
 * `Record<CalculatorSlug, …>` type turns forgetting one (or leaving an extra one) into a compile error.
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
