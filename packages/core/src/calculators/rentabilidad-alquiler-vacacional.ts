// Rentabilidad de un alquiler vacacional (turístico). A diferencia del alquiler
// tradicional, se calcula por noches ocupadas y descuenta la comisión de
// gestión y la limpieza por estancia, que pesan mucho en este modelo. Core puro.

export interface HolidayRentalInput {
  /** Precio de compra del inmueble. */
  purchasePrice: number;
  /** Gastos e impuestos de compra. */
  purchaseCosts: number;
  /** Precio medio por noche. */
  nightlyRate: number;
  /** Noches ocupadas al año. */
  occupiedNights: number;
  /** Comisión de plataforma/gestión sobre los ingresos (%). */
  managementRate: number;
  /** Coste de limpieza por estancia. Opcional (por defecto 0). */
  cleaningFee?: number;
  /** Estancia media en noches (para estimar el nº de limpiezas). Por defecto 3. */
  avgStayNights?: number;
  /** Gastos fijos anuales (IBI, comunidad, seguro, suministros…). */
  annualExpenses: number;
}

export interface HolidayRentalResult {
  /** Ingresos brutos anuales (noches × precio). */
  grossIncome: number;
  /** Comisión de gestión anual. */
  managementCost: number;
  /** Número estimado de estancias al año. */
  stays: number;
  /** Coste anual de limpieza. */
  cleaningCost: number;
  /** Ingreso neto anual (tras gestión, limpieza y gastos fijos). */
  netIncome: number;
  /** Ocupación media (% sobre 365 noches). */
  occupancyRate: number;
  /** Rentabilidad bruta (% sobre el precio de compra). */
  grossYield: number;
  /** Rentabilidad neta (% sobre la inversión total). */
  netYield: number;
}

export function computeHolidayRental(input: HolidayRentalInput): HolidayRentalResult {
  const price = Math.max(0, input.purchasePrice || 0);
  const costs = Math.max(0, input.purchaseCosts || 0);
  const nightlyRate = Math.max(0, input.nightlyRate || 0);
  const nights = Math.min(365, Math.max(0, input.occupiedNights || 0));
  const mgmtRate = Math.min(100, Math.max(0, input.managementRate || 0));
  const cleaningFee = Math.max(0, input.cleaningFee || 0);
  const avgStay = Math.max(1, input.avgStayNights ?? 3);
  const expenses = Math.max(0, input.annualExpenses || 0);

  const grossIncome = nightlyRate * nights;
  const managementCost = grossIncome * (mgmtRate / 100);
  const stays = nights / avgStay;
  const cleaningCost = stays * cleaningFee;
  const netIncome = grossIncome - managementCost - cleaningCost - expenses;
  const totalInvested = price + costs;

  return {
    grossIncome,
    managementCost,
    stays,
    cleaningCost,
    netIncome,
    occupancyRate: (nights / 365) * 100,
    grossYield: price > 0 ? (grossIncome / price) * 100 : 0,
    netYield: totalInvested > 0 ? (netIncome / totalInvested) * 100 : 0,
  };
}
