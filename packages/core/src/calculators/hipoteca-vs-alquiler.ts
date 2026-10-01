// Comprar con hipoteca vs alquilar: coste neto en un horizonte. Core puro. Orientativo: depende mucho de la revalorización y la rentabilidad supuestas.

import { computeMortgage } from "./hipoteca.js";
import { clampYears } from "../inputs.js";

export interface BuyVsRentInput {
  purchasePrice: number;
  purchaseCosts: number;
  downPayment: number;
  mortgageRate: number;
  mortgageTerm: number;
  annualCostRate: number;
  appreciationRate: number;
  monthlyRent: number;
  rentGrowthRate: number;
  investmentReturn: number;
  horizonYears: number;
  /** Gastos de venta al final (% del valor: agencia, plusvalía municipal…); reducen el patrimonio recuperado. */
  sellingCostsRate?: number;
}

export interface BuyVsRentResult {
  buyNetCost: number;
  rentNetCost: number;
  buyEquityEnd: number;
  totalMortgagePaid: number;
  totalRentPaid: number;
  investmentGain: number;
  /** Alquiler − comprar: positivo = comprar sale mejor. */
  difference: number;
  cheaper: "buy" | "rent" | "tie";
}

export function computeBuyVsRent(input: BuyVsRentInput): BuyVsRentResult {
  const price = Math.max(0, input.purchasePrice || 0);
  const purchaseCosts = Math.max(0, input.purchaseCosts || 0);
  const downPayment = Math.min(price, Math.max(0, input.downPayment || 0));
  const term = clampYears(input.mortgageTerm, 1);
  const horizon = clampYears(input.horizonYears, 1);
  const annualCostRate = Math.max(0, input.annualCostRate || 0);
  const appreciation = (input.appreciationRate || 0) / 100;
  const rentGrowth = (input.rentGrowthRate || 0) / 100;
  const investmentReturn = (input.investmentReturn || 0) / 100;
  const monthlyRent = Math.max(0, input.monthlyRent || 0);
  const sellingCostsRate = Math.max(0, input.sellingCostsRate || 0) / 100;

  const loan = Math.max(0, price - downPayment);
  const mortgage = computeMortgage({ principal: loan, annualRate: input.mortgageRate, years: term });
  const monthsPaid = Math.min(horizon, term) * 12;
  const totalMortgagePaid = mortgage.monthlyPayment * monthsPaid;
  const initialOutlay = downPayment + purchaseCosts;
  const ownershipCosts = price * (annualCostRate / 100) * horizon;

  const balanceEnd = horizon >= term ? 0 : (mortgage.schedule[horizon - 1]?.balance ?? loan);
  const homeValueEnd = price * Math.pow(1 + appreciation, horizon);
  // Patrimonio neto si vendieras: valor de mercado − gastos de venta − deuda.
  const buyEquityEnd = homeValueEnd * (1 - sellingCostsRate) - balanceEnd;

  const buyNetCost = initialOutlay + totalMortgagePaid + ownershipCosts - buyEquityEnd;

  let totalRentPaid = 0;
  for (let y = 0; y < horizon; y++) {
    totalRentPaid += monthlyRent * 12 * Math.pow(1 + rentGrowth, y);
  }
  const investmentEnd = initialOutlay * Math.pow(1 + investmentReturn, horizon);
  const investmentGain = investmentEnd - initialOutlay;
  const rentNetCost = totalRentPaid - investmentGain;

  const difference = rentNetCost - buyNetCost;
  const cheaper: BuyVsRentResult["cheaper"] = Math.abs(difference) < 1 ? "tie" : difference > 0 ? "buy" : "rent";

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
