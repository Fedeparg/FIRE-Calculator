// Comprar (con hipoteca) vs alquilar, comparando el coste neto a lo largo de un
// horizonte temporal. Core puro. Orientativo: el resultado depende mucho de los
// supuestos de revalorización del inmueble y rentabilidad de la inversión.

import { computeMortgage } from "./hipoteca.js";

export interface BuyVsRentInput {
  /** Precio de compra del inmueble. */
  purchasePrice: number;
  /** Gastos e impuestos de compra (ITP/IVA, notaría…). */
  purchaseCosts: number;
  /** Entrada (capital aportado; el resto se financia). */
  downPayment: number;
  /** TIN de la hipoteca (%). */
  mortgageRate: number;
  /** Plazo de la hipoteca en años. */
  mortgageTerm: number;
  /** Gastos anuales de propiedad como % del precio (IBI, comunidad, seguro…). */
  annualCostRate: number;
  /** Revalorización anual estimada del inmueble (%). */
  appreciationRate: number;
  /** Alquiler mensual de una vivienda equivalente. */
  monthlyRent: number;
  /** Subida anual del alquiler (%). */
  rentGrowthRate: number;
  /** Rentabilidad anual de invertir el capital no inmovilizado (%). */
  investmentReturn: number;
  /** Horizonte de comparación en años. */
  horizonYears: number;
  /**
   * Gastos de venta al final del horizonte como % del valor del inmueble
   * (agencia, plusvalía municipal…). Reducen el patrimonio neto que recuperas
   * si vendes. Opcional (por defecto 0). */
  sellingCostsRate?: number;
}

export interface BuyVsRentResult {
  /** Coste neto total de comprar en el horizonte. */
  buyNetCost: number;
  /** Coste neto total de alquilar en el horizonte. */
  rentNetCost: number;
  /** Patrimonio neto en el inmueble al final (valor − deuda pendiente). */
  buyEquityEnd: number;
  /** Total de cuotas hipotecarias pagadas en el horizonte. */
  totalMortgagePaid: number;
  /** Total de alquiler pagado en el horizonte. */
  totalRentPaid: number;
  /** Ganancia de invertir el capital de la entrada (escenario alquiler). */
  investmentGain: number;
  /** Diferencia (alquiler − comprar): positivo = comprar sale mejor. */
  difference: number;
  /** Opción más barata en el horizonte. */
  cheaper: "buy" | "rent" | "tie";
}

export function computeBuyVsRent(input: BuyVsRentInput): BuyVsRentResult {
  const price = Math.max(0, input.purchasePrice || 0);
  const purchaseCosts = Math.max(0, input.purchaseCosts || 0);
  const downPayment = Math.min(price, Math.max(0, input.downPayment || 0));
  const term = Math.max(1, Math.round(input.mortgageTerm || 1));
  const horizon = Math.max(1, Math.round(input.horizonYears || 1));
  const annualCostRate = Math.max(0, input.annualCostRate || 0);
  const appreciation = (input.appreciationRate || 0) / 100;
  const rentGrowth = (input.rentGrowthRate || 0) / 100;
  const investmentReturn = (input.investmentReturn || 0) / 100;
  const monthlyRent = Math.max(0, input.monthlyRent || 0);
  const sellingCostsRate = Math.max(0, input.sellingCostsRate || 0) / 100;

  // --- Comprar ---
  const loan = Math.max(0, price - downPayment);
  const mortgage = computeMortgage({ principal: loan, annualRate: input.mortgageRate, years: term });
  const monthsPaid = Math.min(horizon, term) * 12;
  const totalMortgagePaid = mortgage.monthlyPayment * monthsPaid;
  const initialOutlay = downPayment + purchaseCosts;
  const ownershipCosts = price * (annualCostRate / 100) * horizon;

  // Deuda pendiente al final del horizonte (0 si ya está amortizada).
  const balanceEnd =
    horizon >= term ? 0 : (mortgage.schedule[horizon - 1]?.balance ?? loan);
  const homeValueEnd = price * Math.pow(1 + appreciation, horizon);
  // Patrimonio neto si vendieras: valor de mercado − gastos de venta − deuda.
  const buyEquityEnd = homeValueEnd * (1 - sellingCostsRate) - balanceEnd;

  const buyNetCost = initialOutlay + totalMortgagePaid + ownershipCosts - buyEquityEnd;

  // --- Alquilar ---
  let totalRentPaid = 0;
  for (let y = 0; y < horizon; y++) {
    totalRentPaid += monthlyRent * 12 * Math.pow(1 + rentGrowth, y);
  }
  // El capital de la entrada + gastos, invertido en su lugar.
  const investmentEnd = initialOutlay * Math.pow(1 + investmentReturn, horizon);
  const investmentGain = investmentEnd - initialOutlay;
  const rentNetCost = totalRentPaid - investmentGain;

  const difference = rentNetCost - buyNetCost;
  const cheaper: BuyVsRentResult["cheaper"] =
    Math.abs(difference) < 1 ? "tie" : difference > 0 ? "buy" : "rent";

  return {
    buyNetCost,
    rentNetCost,
    buyEquityEnd,
    totalMortgagePaid,
    totalRentPaid,
    investmentGain,
    difference,
    cheaper,
  };
}
