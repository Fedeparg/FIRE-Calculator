// Inflación (IPC): erosión del poder adquisitivo en el tiempo. Core puro.
// Modelo basado en una tasa media anual (v1). Una versión futura podrá usar
// datos reales del IPC del INE.
//
// Además del dinero "parado", modela qué pasa si ese importe se invierte a una
// rentabilidad nominal dada: comparar el poder adquisitivo del dinero quieto con
// el del dinero invertido es la mejor forma de entender por qué hay que batir a
// la inflación.

export interface InflationInput {
  /** Importe de referencia (hoy). */
  amount: number;
  /** Inflación media anual, en base 100 (3 = 3 %). */
  annualRate: number;
  /** Horizonte en años. */
  years: number;
  /**
   * Rentabilidad nominal anual a la que se coloca el dinero, en base 100
   * (2 = 2 %). 0 = dinero "parado" (cuenta corriente). Opcional.
   */
  nominalReturn?: number;
}

export interface InflationPoint {
  // Firma de índice numérica para consumirlo como dato genérico de gráfica.
  [key: string]: number;
  year: number;
  /** Importe nominal necesario para mantener el poder adquisitivo. */
  nominalNeeded: number;
  /** Valor real (poder adquisitivo) del importe original si se deja parado. */
  realValue: number;
  /** Valor real (poder adquisitivo) del importe si se invierte a `nominalReturn`. */
  realValueInvested: number;
}

export interface InflationResult {
  /** Importe nominal equivalente al final del horizonte. */
  nominalNeeded: number;
  /** Poder adquisitivo del importe original (parado) al final del horizonte. */
  realValue: number;
  /** Poder adquisitivo del importe si se invierte a `nominalReturn`, al final. */
  realValueInvested: number;
  /** Pérdida de poder adquisitivo del dinero parado, en base 100 (%). */
  lossPercent: number;
  /** Rentabilidad real anualizada del dinero invertido, en base 100 (%). */
  realReturn: number;
  series: InflationPoint[];
}

export function computeInflation(input: InflationInput): InflationResult {
  const amount = Math.max(0, input.amount || 0);
  const rate = (input.annualRate || 0) / 100;
  const ret = (input.nominalReturn || 0) / 100;
  const years = Math.max(0, Math.round(input.years || 0));

  const series: InflationPoint[] = [];
  for (let year = 0; year <= years; year++) {
    const inflationFactor = Math.pow(1 + rate, year);
    const investFactor = Math.pow(1 + ret, year);
    series.push({
      year,
      nominalNeeded: amount * inflationFactor,
      realValue: inflationFactor !== 0 ? amount / inflationFactor : amount,
      realValueInvested: inflationFactor !== 0 ? (amount * investFactor) / inflationFactor : amount * investFactor,
    });
  }

  const finalFactor = Math.pow(1 + rate, years);
  const realValue = finalFactor !== 0 ? amount / finalFactor : amount;
  const realValueInvested = finalFactor !== 0 ? (amount * Math.pow(1 + ret, years)) / finalFactor : amount;

  // Rentabilidad real anualizada (efecto Fisher exacto): (1+r)/(1+i) − 1.
  const realReturn = ((1 + ret) / (1 + rate) - 1) * 100;

  return {
    nominalNeeded: amount * finalFactor,
    realValue,
    realValueInvested,
    lossPercent: amount > 0 ? ((amount - realValue) / amount) * 100 : 0,
    realReturn,
    series,
  };
}
