// ROI (retorno de la inversión). Core puro. Tiene en cuenta los costes de la
// operación y las rentas cobradas (dividendos, cupones, alquileres), el ROI
// anualizado (CAGR) y el ROI neto tras impuestos sobre la ganancia.

export interface RoiInput {
  /** Inversión inicial. */
  initial: number;
  /** Valor final / importe recuperado. */
  final: number;
  /** Horizonte en años (opcional, para anualizar). */
  years?: number;
  /** Costes de la operación (comisiones de compra/venta, gastos). Opcional. */
  costs?: number;
  /** Rentas cobradas durante la inversión (dividendos, cupones, alquiler). Opcional. */
  income?: number;
  /** Impuesto sobre la ganancia, en base 100. Por defecto 19 % (base del ahorro). */
  taxRate?: number;
}

export interface RoiResult {
  /** Capital total comprometido (inicial + costes). */
  invested: number;
  /** Ganancia/pérdida absoluta (incluye rentas y costes). */
  gain: number;
  /** ROI total, en base 100 (%). */
  roi: number;
  /** ROI anualizado (CAGR) en base 100, o null si no aplica. */
  annualized: number | null;
  /** Impuesto estimado sobre la ganancia (0 si hay pérdida). */
  tax: number;
  /** Ganancia neta tras impuestos. */
  netGain: number;
  /** ROI neto tras impuestos, en base 100 (%). */
  netRoi: number;
}

export function computeRoi(input: RoiInput): RoiResult {
  const initial = input.initial || 0;
  const final = input.final || 0;
  const costs = Math.max(0, input.costs || 0);
  const income = input.income || 0;
  const taxRate = Math.min(100, Math.max(0, input.taxRate ?? 19)) / 100;

  const invested = initial + costs;
  const gain = final + income - invested;
  const roi = invested !== 0 ? (gain / invested) * 100 : 0;

  let annualized: number | null = null;
  if (input.years && input.years > 0 && invested > 0 && final + income > 0) {
    annualized = (Math.pow((final + income) / invested, 1 / input.years) - 1) * 100;
  }

  // El impuesto solo grava la ganancia positiva.
  const tax = gain > 0 ? gain * taxRate : 0;
  const netGain = gain - tax;
  const netRoi = invested !== 0 ? (netGain / invested) * 100 : 0;

  return { invested, gain, roi, annualized, tax, netGain, netRoi };
}
