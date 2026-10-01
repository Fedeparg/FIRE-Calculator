// Depósito a plazo fijo: capitaliza a la TAE y aplica la retención española sobre los intereses. Core puro.

export interface DepositInput {
  principal: number;
  apr: number;
  years: number;
  /** Retención sobre los intereses, en base 100. Por defecto 19 % (España). */
  withholdingRate?: number;
  /** Inflación anual, en base 100; si se indica, se calcula el valor final en poder adquisitivo de hoy. */
  inflationRate?: number;
}

export interface DepositResult {
  finalGross: number;
  grossInterest: number;
  withheld: number;
  netInterest: number;
  finalNet: number;
  /** Valor final neto en poder adquisitivo de hoy (descontada la inflación). */
  realFinalNet: number;
}

export function computeDeposit(input: DepositInput): DepositResult {
  const principal = Math.max(0, input.principal || 0);
  const apr = (input.apr || 0) / 100;
  const years = Math.max(0, input.years || 0);
  const withholding = Math.min(100, Math.max(0, input.withholdingRate ?? 19)) / 100;
  const inflation = (input.inflationRate || 0) / 100;

  const finalGross = principal * Math.pow(1 + apr, years);
  const grossInterest = finalGross - principal;
  const withheld = grossInterest * withholding;
  const netInterest = grossInterest - withheld;
  const finalNet = principal + netInterest;

  return {
    finalGross,
    grossInterest,
    withheld,
    netInterest,
    finalNet,
    realFinalNet: finalNet / Math.pow(1 + inflation, years),
  };
}
