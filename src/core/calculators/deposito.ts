// Depósito a plazo fijo / cuenta remunerada. Capitaliza a la TAE y aplica la
// retención fiscal española sobre los intereses (rendimientos del capital
// mobiliario). Core puro. Reutilizable por ambas calculadoras.

export interface DepositInput {
  /** Capital depositado. */
  principal: number;
  /** TAE (tasa anual equivalente), en base 100 (3 = 3 %). */
  apr: number;
  /** Plazo en años (admite decimales: 0,5 = 6 meses). */
  years: number;
  /** Retención sobre los intereses, en base 100. Por defecto 19 % (España). */
  withholdingRate?: number;
  /**
   * Inflación anual estimada, en base 100. Si se indica, se calcula el valor
   * final en poder adquisitivo de hoy. Opcional (por defecto 0).
   */
  inflationRate?: number;
}

export interface DepositResult {
  /** Valor final antes de impuestos. */
  finalGross: number;
  /** Intereses brutos generados. */
  grossInterest: number;
  /** Importe retenido (impuestos). */
  withheld: number;
  /** Intereses netos (tras retención). */
  netInterest: number;
  /** Valor final neto (capital + intereses netos). */
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
