// Conversión de divisas y agregación de cartera. Lógica pura (sin Nest), testeable.
//
// ⚠️ ESPEJO de `src/core/fx.ts` (frontend). Son paquetes distintos (la raíz NO es
// dependencia de `@sextante/api`), así que no se puede compartir el módulo: si cambias
// una fórmula aquí, cámbiala también allí (y viceversa). Verificado por contraste:
// `get_portfolio_valuation` (MCP) devuelve el mismo número que muestra la UI.

/**
 * Convierte `amount` de la divisa `from` a `to`. `rates[CCY]` = USD por unidad de esa
 * divisa (USD = 1), así que A→B es `amount * rates[A] / rates[B]`. Devuelve `null` si
 * falta la tasa de origen o de destino: preferimos excluir esa posición del total a
 * inventarse un número.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number | null {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || !fromRate || !toRate) {
    return null;
  }
  return (amount * fromRate) / toRate;
}

/** Entrada mínima para agregar (independiente de los tipos de la app, para poder testear). */
export interface AggregateInput {
  positions: { ticker: string; quantity: number; avgPrice: number; currency: string }[];
  /** Último precio por ticker; cada uno con su divisa nativa. */
  prices: Record<string, { close: number; currency: string }>;
  /** USD por unidad de cada divisa (USD = 1). */
  rates: Record<string, number>;
  /** Divisa en la que el usuario quiere ver el total. */
  display: string;
}

/** Total agregado de la cartera, ya convertido a la divisa elegida. */
export interface PortfolioAggregate {
  /** Invertido (coste) de las posiciones VALORADAS, en `display`. */
  invested: number;
  /** Valor actual de las posiciones valoradas, en `display`. */
  marketValue: number;
  /** Ganancia/pérdida absoluta (valor − invertido), en `display`. */
  pnlAbs: number;
  /** Rentabilidad en %, o null si el invertido es 0. */
  pnlPct: number | null;
  /** Nº de posiciones incluidas en el total. */
  valued: number;
  /** Nº total de posiciones (valued + excluidas por falta de precio/divisa). */
  total: number;
  display: string;
}

/**
 * Agrega la cartera a una divisa elegida. Una posición SOLO cuenta si: (1) hay precio,
 * (2) el precio viene en la misma divisa que la posición —misma regla que el P&L por fila,
 * no mezclamos divisas— y (3) su divisa es convertible a `display`. Las que no cumplan se
 * excluyen. Invertido, valor y P&L se calculan sobre el MISMO subconjunto para que
 * P&L = valor − invertido cuadre siempre.
 */
export function aggregatePortfolio({
  positions,
  prices,
  rates,
  display,
}: AggregateInput): PortfolioAggregate {
  let invested = 0;
  let marketValue = 0;
  let valued = 0;

  for (const p of positions) {
    const price = prices[p.ticker];
    if (!price || price.currency !== p.currency) continue;

    const investedDisplay = convertCurrency(p.quantity * p.avgPrice, p.currency, display, rates);
    const valueDisplay = convertCurrency(p.quantity * price.close, p.currency, display, rates);
    if (investedDisplay === null || valueDisplay === null) continue;

    invested += investedDisplay;
    marketValue += valueDisplay;
    valued += 1;
  }

  const pnlAbs = marketValue - invested;
  const pnlPct = invested > 0 ? (pnlAbs / invested) * 100 : null;
  return { invested, marketValue, pnlAbs, pnlPct, valued, total: positions.length, display };
}
