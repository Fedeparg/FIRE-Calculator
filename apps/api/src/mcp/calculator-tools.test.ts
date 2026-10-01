import { describe, expect, it } from 'vitest';

import { computeMortgage } from '@sextante/core/calculators/hipoteca';
import { simulateFire, type MonteCarloInput } from '@sextante/core/calculators/fire-montecarlo';
import { estimateNetSalary } from '@sextante/core/fiscal/irpf';

import { CALCULATOR_TOOLS } from './calculator-tools.js';

/**
 * Una entrada realista por tool. El test exige que cada tool tenga la suya: una tool nueva sin
 * muestra falla aquí en vez de llegar a producción sin haberse ejecutado nunca.
 */
const SAMPLES: Record<string, Record<string, unknown>> = {
  calculate_compound_interest: { initial: 10_000, contribution: 300, annualRate: 7, years: 20 },
  calculate_simple_interest: { principal: 10_000, annualRate: 3, years: 2 },
  calculate_average_price: {
    purchases: [
      { price: 100, shares: 10, commission: 2 },
      { price: 80, shares: 5 },
    ],
    currentPrice: 95,
  },
  calculate_dividends: { shares: 100, dividendPerShare: 2, sharePrice: 50, years: 5 },
  calculate_roi: { initial: 1000, final: 1500, years: 3 },
  calculate_staking: { principal: 5000, apy: 6, years: 3 },
  calculate_fire: {
    annualExpenses: 24_000,
    currentSavings: 100_000,
    savings: 1500,
    annualReturn: 5,
    withdrawalRate: 4,
  },
  simulate_fire_monte_carlo: {
    annualExpenses: 24_000,
    currentSavings: 100_000,
    monthlySavings: 1500,
    annualReturn: 5,
    volatility: 15,
    withdrawalRate: 4,
    retirementYears: 30,
    paths: 200,
  },
  calculate_retirement_savings: {
    currentAge: 30,
    retirementAge: 65,
    currentSavings: 20_000,
    monthlySavings: 400,
    annualReturn: 6,
  },
  calculate_budget: { income: 2500, needs: 1200, wants: 700 },
  calculate_mortgage: { principal: 200_000, annualRate: 3, years: 30 },
  calculate_mortgage_affordability: {
    netMonthlyIncome: 3500,
    monthlyDebts: 200,
    downPayment: 60_000,
    annualRate: 3,
    termYears: 30,
  },
  compare_buy_vs_rent: {
    purchasePrice: 300_000,
    purchaseCosts: 30_000,
    downPayment: 60_000,
    mortgageRate: 3,
    mortgageTerm: 30,
    annualCostRate: 1,
    appreciationRate: 2,
    monthlyRent: 1100,
    rentGrowthRate: 3,
    investmentReturn: 5,
    horizonYears: 20,
  },
  calculate_early_repayment: {
    pendingPrincipal: 150_000,
    annualRate: 3,
    remainingYears: 20,
    extraPayment: 20_000,
  },
  calculate_rental_yield: { purchasePrice: 200_000, purchaseCosts: 20_000, monthlyRent: 900 },
  calculate_holiday_rental_yield: {
    purchasePrice: 250_000,
    purchaseCosts: 25_000,
    nightlyRate: 120,
    occupiedNights: 180,
    managementRate: 15,
    annualExpenses: 4000,
  },
  calculate_deposit: { principal: 10_000, apr: 2.5, years: 1 },
  calculate_net_salary: { grossAnnual: 35_000, region: 'madrid' },
  calculate_payroll_withholding: { grossAnnual: 35_000, payments: 12 },
  calculate_self_employed_tax: { income: 50_000, expenses: 8000, socialSecurity: 3600 },
  calculate_pension_plan_relief: { grossAnnual: 50_000, contribution: 1500, region: 'cataluna' },
  calculate_gift_tax: { amount: 100_000, kinship: 'grupoI_II' },
  calculate_wealth_tax: { totalWealth: 2_000_000, primaryResidenceValue: 400_000 },
  calculate_credit_card_payoff: { balance: 3000, annualRate: 22, monthlyPayment: 150 },
  calculate_inflation: { amount: 1000, annualRate: 3, years: 10 },
  score_financial_health: { emergencyFund: 3, savingsRate: 2, debt: 3 },
};

const toolByName = (name: string) => {
  const tool = CALCULATOR_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`No existe la tool ${name}`);
  return tool;
};

describe('CALCULATOR_TOOLS', () => {
  it('no repite nombres (el SDK rechaza registrar dos veces el mismo)', () => {
    const names = CALCULATOR_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('tiene una entrada de muestra para cada tool, y ninguna sobrante', () => {
    expect(CALCULATOR_TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  it.each(CALCULATOR_TOOLS.map((t) => [t.name, t] as const))(
    '%s calcula con una entrada realista y el resultado se serializa',
    (name, tool) => {
      const result = tool.execute(SAMPLES[name]);
      expect(result).toBeTypeOf('object');
      expect(() => JSON.stringify(result)).not.toThrow();
    },
  );

  it('da exactamente lo mismo que la calculadora de la web', () => {
    const input = { principal: 200_000, annualRate: 3, years: 30 };
    expect(toolByName('calculate_mortgage').execute(input)).toEqual(computeMortgage(input));

    const salary = { grossAnnual: 35_000, region: 'madrid' as const };
    expect(toolByName('calculate_net_salary').execute(salary)).toEqual(estimateNetSalary(salary));
  });

  it('el Monte Carlo es el de la web: misma semilla, mismo resultado', () => {
    const tool = toolByName('simulate_fire_monte_carlo');
    const input: MonteCarloInput = {
      annualExpenses: 24_000,
      currentSavings: 100_000,
      monthlySavings: 1500,
      annualReturn: 5,
      volatility: 15,
      withdrawalRate: 4,
      retirementYears: 30,
    };
    const options = { paths: 200, seed: 7 };

    expect(tool.execute({ ...input, ...options })).toEqual(
      simulateFire({ ...input, returnModel: { kind: 'lognormal' } }, options),
    );
    // El % en bolsa del modelo histórico va en base 100, igual que en la web.
    expect(tool.execute({ ...input, ...options, historicalStockShare: 60 })).toEqual(
      simulateFire({ ...input, returnModel: { kind: 'historical', stockShare: 60 } }, options),
    );
  });

  it('añade la tabla de sensibilidad solo si se pide', () => {
    const tool = toolByName('simulate_fire_monte_carlo');
    expect(tool.execute(SAMPLES.simulate_fire_monte_carlo)).not.toHaveProperty('sensitivity');
    expect(tool.execute({ ...SAMPLES.simulate_fire_monte_carlo, includeSensitivity: true })).toHaveProperty(
      'sensitivity',
    );
  });

  it('rechaza entradas fuera de rango antes de calcular', () => {
    const monteCarlo = toolByName('simulate_fire_monte_carlo');
    expect(() => monteCarlo.execute({ ...SAMPLES.simulate_fire_monte_carlo, paths: 1_000_000 })).toThrow();
    expect(() => monteCarlo.execute({ ...SAMPLES.simulate_fire_monte_carlo, retirementYears: 500 })).toThrow();

    const compound = toolByName('calculate_compound_interest');
    expect(() => compound.execute({ ...SAMPLES.calculate_compound_interest, years: 10_000 })).toThrow();
    expect(() => compound.execute({ ...SAMPLES.calculate_compound_interest, initial: -1 })).toThrow();
    expect(() => compound.execute({ ...SAMPLES.calculate_compound_interest, initial: 'mil' })).toThrow();

    expect(() => toolByName('calculate_net_salary').execute({ grossAnnual: 30_000, region: 'navarra' })).toThrow();
  });

  it('la tarjeta resume la serie mensual en el saldo de cada año y el último mes', () => {
    const result = toolByName('calculate_credit_card_payoff').execute(SAMPLES.calculate_credit_card_payoff) as {
      monthsToPayoff: number;
      yearlySeries: { month: number }[];
    };
    const months = result.yearlySeries.map((p) => p.month);
    expect(months[0]).toBe(0);
    expect(months.at(-1)).toBe(result.monthsToPayoff);
    expect(months.slice(0, -1).every((m) => m % 12 === 0)).toBe(true);
  });

  it('una deuda que no se salda devuelve monthsToPayoff null', () => {
    const result = toolByName('calculate_credit_card_payoff').execute({
      balance: 10_000,
      annualRate: 30,
      monthlyPayment: 10,
    });
    expect(result).toMatchObject({ monthsToPayoff: null, yearlySeries: [] });
  });

  it('el test de salud financiera puntúa por índice de opción', () => {
    const tool = toolByName('score_financial_health');
    const best = Object.fromEntries(
      ['emergencyFund', 'savingsRate', 'debt', 'housingCost', 'investing', 'retirement', 'protection', 'tracking'].map(
        (id) => [id, 3],
      ),
    );
    expect(tool.execute(best)).toEqual({ score: 100, category: 'strong' });
    expect(tool.execute({})).toEqual({ score: 0, category: 'critical' });
    expect(() => tool.execute({ debt: 4 })).toThrow();
  });
});
