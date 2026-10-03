// Holiday rental yield: by occupied nights, with a management fee and a cleaning cost per stay. Pure core.

export interface HolidayRentalInput {
  purchasePrice: number;
  purchaseCosts: number;
  nightlyRate: number;
  occupiedNights: number;
  managementRate: number;
  cleaningFee?: number;
  avgStayNights?: number;
  annualExpenses: number;
}

export interface HolidayRentalResult {
  grossIncome: number;
  managementCost: number;
  stays: number;
  cleaningCost: number;
  netIncome: number;
  occupancyRate: number;
  grossYield: number;
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
