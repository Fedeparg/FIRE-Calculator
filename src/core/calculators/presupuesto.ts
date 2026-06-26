// Presupuesto mensual con la regla 50/30/20 (necesidades / deseos / ahorro).
// Core puro.

export interface BudgetInput {
  /** Ingresos mensuales netos. */
  income: number;
  /** Gasto mensual en necesidades (vivienda, comida, suministros…). */
  needs: number;
  /** Gasto mensual en deseos (ocio, caprichos…). */
  wants: number;
}

export interface BudgetResult {
  /** Ahorro mensual resultante (ingresos - necesidades - deseos). */
  savings: number;
  /** Ahorro anual (ahorro mensual × 12). */
  annualSavings: number;
  /** Tasa de ahorro (%). */
  savingsRate: number;
  /** Porcentaje de los ingresos dedicado a necesidades (%). */
  needsRate: number;
  /** Porcentaje de los ingresos dedicado a deseos (%). */
  wantsRate: number;
  /** Recomendado por la regla 50/30/20. */
  recommendedNeeds: number;
  recommendedWants: number;
  recommendedSavings: number;
}

export function computeBudget(input: BudgetInput): BudgetResult {
  const income = Math.max(0, input.income || 0);
  const needs = Math.max(0, input.needs || 0);
  const wants = Math.max(0, input.wants || 0);

  const savings = income - needs - wants;
  const rate = (part: number) => (income > 0 ? (part / income) * 100 : 0);

  return {
    savings,
    annualSavings: savings * 12,
    savingsRate: rate(savings),
    needsRate: rate(needs),
    wantsRate: rate(wants),
    recommendedNeeds: income * 0.5,
    recommendedWants: income * 0.3,
    recommendedSavings: income * 0.2,
  };
}
