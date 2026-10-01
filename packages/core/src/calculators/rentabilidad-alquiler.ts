// Rentabilidad bruta y neta de un alquiler de larga duración, con gastos recurrentes y vacancy. Core puro.

export interface RentalInput {
  purchasePrice: number;
  purchaseCosts: number;
  monthlyRent: number;
  /** Previsión de impago / meses vacíos, como % del año. Por defecto 5 %. */
  vacancyRate?: number;
  ibiAnnual?: number;
  communityMonthly?: number;
  insuranceAnnual?: number;
  maintenanceAnnual?: number;
}

export interface RentalResult {
  annualRentIncome: number;
  effectiveRentIncome: number;
  totalAnnualExpenses: number;
  netIncome: number;
  monthlyNetCashflow: number;
  grossYield: number;
  netYield: number;
}

export function computeRentalYield(input: RentalInput): RentalResult {
  const price = Math.max(0, input.purchasePrice || 0);
  const costs = Math.max(0, input.purchaseCosts || 0);
  const rent = Math.max(0, input.monthlyRent || 0);
  const vacancy = Math.min(100, Math.max(0, input.vacancyRate ?? 5)) / 100;
  const ibi = Math.max(0, input.ibiAnnual || 0);
  const community = Math.max(0, input.communityMonthly || 0) * 12;
  const insurance = Math.max(0, input.insuranceAnnual || 0);
  const maintenance = Math.max(0, input.maintenanceAnnual || 0);

  const annualRentIncome = rent * 12;
  const effectiveRentIncome = annualRentIncome * (1 - vacancy);
  const totalAnnualExpenses = ibi + community + insurance + maintenance;
  const netIncome = effectiveRentIncome - totalAnnualExpenses;
  const totalInvested = price + costs;

  return {
    annualRentIncome,
    effectiveRentIncome,
    totalAnnualExpenses,
    netIncome,
    monthlyNetCashflow: netIncome / 12,
    grossYield: price > 0 ? (annualRentIncome / price) * 100 : 0,
    netYield: totalInvested > 0 ? (netIncome / totalInvested) * 100 : 0,
  };
}
