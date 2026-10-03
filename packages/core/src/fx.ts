// Conversión de divisas. Core puro. Compartido por el frontend y la API (valoración diaria, tool
// MCP `get_portfolio_valuation`) para que den el mismo número. La agregación de la cartera vive en
// `portfolio/aggregate.ts`.

/** Divisa pivote de las tasas: `rates[CCY]` son USD por unidad de CCY. */
const FX_PIVOT = "USD";

/**
 * USD por unidad de `currency`, o `null` si no hay una tasa utilizable (falta, no es finita o es 0).
 * El pivote vale siempre 1, venga o no en `rates`.
 */
function usableRate(currency: string, rates: Readonly<Record<string, number | undefined>>): number | null {
  const rate = currency === FX_PIVOT ? 1 : rates[currency];
  return rate !== undefined && Number.isFinite(rate) && rate !== 0 ? rate : null;
}

/**
 * ¿Se puede convertir de `from` a `to` con estas tasas? Lo mismo que `convertCurrency(…) !== null`,
 * sin tener que convertir un importe de prueba.
 */
export function canConvert(from: string, to: string, rates: Readonly<Record<string, number>>): boolean {
  return from === to || (usableRate(from, rates) !== null && usableRate(to, rates) !== null);
}

/**
 * Convierte `amount` de `from` a `to`. `rates[CCY]` = USD por unidad (USD = 1, implícito). Devuelve
 * `null` si falta una tasa: es preferible excluir la posición del total a inventar un número.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Readonly<Record<string, number>>,
): number | null {
  if (from === to) return amount;
  const fromRate = usableRate(from, rates);
  const toRate = usableRate(to, rates);
  if (fromRate === null || toRate === null) return null;
  return (amount * fromRate) / toRate;
}
