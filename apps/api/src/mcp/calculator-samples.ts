// Entradas de muestra compartidas por los tests de las calculadoras MCP.

/**
 * Una entrada realista por calculadora. El test exige que cada una tenga la suya: una nueva sin
 * muestra falla aquí en vez de llegar a producción sin haberse ejecutado nunca.
 */
export const SAMPLES: Record<string, Record<string, unknown>> = {
  'interes-compuesto': { initial: 10_000, contribution: 300, annualRate: 7, years: 20 },
  'interes-simple': { principal: 10_000, annualRate: 3, years: 2 },
  'promediar-acciones': {
    purchases: [
      { price: 100, shares: 10, commission: 2 },
      { price: 80, shares: 5 },
    ],
    currentPrice: 95,
  },
  dividendos: { shares: 100, dividendPerShare: 2, sharePrice: 50, years: 5 },
  roi: { initial: 1000, final: 1500, years: 3 },
  staking: { principal: 5000, apy: 6, years: 3 },
  'independencia-financiera': {
    annualExpenses: 24_000,
    currentSavings: 100_000,
    savings: 1500,
    annualReturn: 5,
    withdrawalRate: 4,
  },
  'simulador-montecarlo': {
    annualExpenses: 24_000,
    currentSavings: 100_000,
    monthlySavings: 1500,
    annualReturn: 5,
    volatility: 15,
    withdrawalRate: 4,
    retirementYears: 30,
    paths: 200,
  },
  'ahorro-jubilacion': {
    currentAge: 30,
    retirementAge: 65,
    currentSavings: 20_000,
    monthlySavings: 400,
    annualReturn: 6,
  },
  'presupuesto-mensual': { income: 2500, needs: 1200, wants: 700 },
  'hipoteca-fija': { principal: 200_000, annualRate: 3, years: 30 },
  'que-hipoteca-me-puedo-permitir': {
    netMonthlyIncome: 3500,
    monthlyDebts: 200,
    downPayment: 60_000,
    annualRate: 3,
    termYears: 30,
  },
  'hipoteca-vs-alquiler': {
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
  'amortizacion-anticipada': {
    pendingPrincipal: 150_000,
    annualRate: 3,
    remainingYears: 20,
    extraPayment: 20_000,
  },
  'rentabilidad-alquiler': { purchasePrice: 200_000, purchaseCosts: 20_000, monthlyRent: 900 },
  'rentabilidad-alquiler-vacacional': {
    purchasePrice: 250_000,
    purchaseCosts: 25_000,
    nightlyRate: 120,
    occupiedNights: 180,
    managementRate: 15,
    annualExpenses: 4000,
  },
  'deposito-plazo-fijo': { principal: 10_000, apr: 2.5, years: 1 },
  'cuenta-remunerada': { principal: 10_000, apr: 2.5, years: 1 },
  'salario-bruto-neto': { grossAnnual: 35_000, region: 'madrid' },
  'irpf-nomina': { grossAnnual: 35_000, payments: 12 },
  'irpf-autonomos': { income: 50_000, expenses: 8000, socialSecurity: 3600 },
  'desgravacion-plan-pensiones': { grossAnnual: 50_000, contribution: 1500, region: 'cataluna' },
  'impuesto-donaciones': { amount: 100_000, kinship: 'grupoI_II' },
  'impuesto-patrimonio': { totalWealth: 2_000_000, primaryResidenceValue: 400_000 },
  'intereses-tarjeta-credito': { balance: 3000, annualRate: 22, monthlyPayment: 150 },
  inflacion: { amount: 1000, annualRate: 3, years: 10 },
  'salud-financiera': { emergencyFund: 3, savingsRate: 2, debt: 3 },
};

