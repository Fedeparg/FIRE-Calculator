// Dividendos de acciones: ingreso anual por dividendos, retención fiscal española
// y proyección del flujo de dividendos con crecimiento anual. Core puro.

export interface DividendInput {
  /** Número de acciones. */
  shares: number;
  /** Dividendo anual por acción. */
  dividendPerShare: number;
  /** Precio por acción (opcional, para calcular la rentabilidad por dividendo). */
  sharePrice?: number;
  /** Retención sobre los dividendos, en base 100. Por defecto 19 % (España). */
  withholdingRate?: number;
  /** Crecimiento anual del dividendo, en base 100. Opcional (por defecto 0). */
  annualGrowth?: number;
  /** Horizonte de la proyección en años. Opcional (por defecto 0 = solo año 1). */
  years?: number;
}

export interface DividendYearPoint {
  [key: string]: number;
  year: number;
  /** Dividendo bruto de ese año. */
  grossAnnual: number;
  /** Dividendo neto de ese año (tras retención). */
  netAnnual: number;
  /** Dividendo neto acumulado hasta ese año. */
  cumulativeNet: number;
}

export interface DividendResult {
  /** Dividendo bruto anual (año 1). */
  gross: number;
  /** Importe retenido (año 1). */
  withheld: number;
  /** Dividendo neto anual (año 1). */
  net: number;
  /** Rentabilidad por dividendo bruta (%), o null sin precio. */
  grossYield: number | null;
  /** Rentabilidad por dividendo neta (%), o null sin precio. */
  netYield: number | null;
  /** Dividendo neto acumulado a lo largo del horizonte. */
  cumulativeNet: number;
  /** Dividendo neto del último año del horizonte. */
  finalYearNet: number;
  /** Serie anual (año 0 = punto base, sin dividendo cobrado todavía). */
  series: DividendYearPoint[];
}

export function computeDividends(input: DividendInput): DividendResult {
  const shares = Math.max(0, input.shares || 0);
  const dividendPerShare = Math.max(0, input.dividendPerShare || 0);
  const withholding = Math.min(100, Math.max(0, input.withholdingRate ?? 19)) / 100;
  const growth = Math.max(0, input.annualGrowth || 0) / 100;
  const years = Math.max(0, Math.round(input.years || 0));

  const gross = shares * dividendPerShare;
  const withheld = gross * withholding;
  const net = gross - withheld;

  const invested = shares * Math.max(0, input.sharePrice || 0);
  const grossYield = invested > 0 ? (gross / invested) * 100 : null;
  const netYield = invested > 0 ? (net / invested) * 100 : null;

  const series: DividendYearPoint[] = [{ year: 0, grossAnnual: 0, netAnnual: 0, cumulativeNet: 0 }];
  let cumulativeNet = 0;
  let finalYearNet = net;
  for (let year = 1; year <= years; year++) {
    const factor = Math.pow(1 + growth, year - 1);
    const grossAnnual = gross * factor;
    const netAnnual = net * factor;
    cumulativeNet += netAnnual;
    finalYearNet = netAnnual;
    series.push({ year, grossAnnual, netAnnual, cumulativeNet });
  }

  return {
    gross,
    withheld,
    net,
    grossYield,
    netYield,
    cumulativeNet,
    finalYearNet,
    series,
  };
}
