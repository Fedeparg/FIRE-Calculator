// Conversión de divisas y agregación de cartera. Core puro. Compartido por el frontend y la API
// (valoración diaria, tool MCP `get_portfolio_valuation`) para que den el mismo número.

/**
 * Convierte `amount` de `from` a `to`. `rates[CCY]` = USD por unidad (USD = 1). Devuelve `null` si
 * falta una tasa: es preferible excluir la posición del total a inventar un número.
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

/** Entrada mínima para agregar, independiente de los tipos de la app. */
export interface AggregateInput {
  positions: {
    ticker: string;
    quantity: number;
    avgPrice: number;
    currency: string;
    /** Los derivados no se valoran y quedan fuera del total; es obligatorio para que no se mezclen en el P&L. */
    isDerivative: boolean;
  }[];
  prices: Record<string, { close: number; currency: string }>;
  rates: Record<string, number>;
  display: string;
}

export interface PortfolioAggregate {
  /** Coste de las posiciones valoradas, en `display`. */
  invested: number;
  marketValue: number;
  pnlAbs: number;
  pnlPct: number | null;
  valued: number;
  /** Nº de posiciones valorables (valoradas + excluidas por falta de precio/divisa); sin derivados. */
  total: number;
  display: string;
}

/**
 * Agrega la cartera a `display`. Cuenta una posición con precio y ambas divisas convertibles. El
 * coste se convierte desde `p.currency` (la de `avgPrice`) y el valor desde `price.currency` (la
 * nativa del instrumento); pueden diferir. Invertido, valor y P&L usan el mismo subconjunto para
 * que P&L = valor − invertido cuadre.
 */
export function aggregatePortfolio({ positions, prices, rates, display }: AggregateInput): PortfolioAggregate {
  let invested = 0;
  let marketValue = 0;
  let valued = 0;

  // Sextante no sigue el precio de los derivados: sin cotización fiable distorsionarían el P&L.
  const tracked = positions.filter((p) => !p.isDerivative);

  for (const p of tracked) {
    const price = prices[p.ticker];
    if (!price) continue;

    const investedDisplay = convertCurrency(p.quantity * p.avgPrice, p.currency, display, rates);
    const valueDisplay = convertCurrency(p.quantity * price.close, price.currency, display, rates);
    if (investedDisplay === null || valueDisplay === null) continue;

    invested += investedDisplay;
    marketValue += valueDisplay;
    valued += 1;
  }

  const pnlAbs = marketValue - invested;
  const pnlPct = invested > 0 ? (pnlAbs / invested) * 100 : null;
  return { invested, marketValue, pnlAbs, pnlPct, valued, total: tracked.length, display };
}
