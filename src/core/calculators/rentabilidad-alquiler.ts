// Rentabilidad de un alquiler de larga duración: bruta y neta. Detalla los
// gastos recurrentes (IBI, comunidad, seguro, mantenimiento) y descuenta una
// previsión de meses sin inquilino o impago (vacancy). Core puro.

export interface RentalInput {
  /** Precio de compra del inmueble. */
  purchasePrice: number;
  /** Gastos e impuestos de compra (ITP/IVA, notaría, etc.). */
  purchaseCosts: number;
  /** Alquiler mensual. */
  monthlyRent: number;
  /** Previsión de impago / meses vacíos, como % del año. Por defecto 5 %. */
  vacancyRate?: number;
  /** IBI anual. */
  ibiAnnual?: number;
  /** Cuota de comunidad mensual. */
  communityMonthly?: number;
  /** Seguro (hogar + impago) anual. */
  insuranceAnnual?: number;
  /** Mantenimiento y reparaciones anuales. */
  maintenanceAnnual?: number;
}

export interface RentalResult {
  /** Ingresos anuales potenciales (alquiler × 12, sin descontar vacancy). */
  annualRentIncome: number;
  /** Ingresos anuales efectivos (tras descontar la vacancy). */
  effectiveRentIncome: number;
  /** Total de gastos anuales recurrentes. */
  totalAnnualExpenses: number;
  /** Ingreso neto anual (efectivo − gastos). */
  netIncome: number;
  /** Flujo de caja neto mensual medio. */
  monthlyNetCashflow: number;
  /** Rentabilidad bruta (% del alquiler potencial sobre el precio de compra). */
  grossYield: number;
  /** Rentabilidad neta (% sobre la inversión total: precio + gastos de compra). */
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
