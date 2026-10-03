// Valoración agregada de la cartera en una divisa. Core puro. La usan la web (Resumen), la API
// (valoración diaria, snapshots, alertas) y la tool MCP `get_portfolio_valuation`.

import { convertCurrency } from "../fx.js";

/** Lo que hace falta de una posición para valorarla en otra divisa. */
export interface ValuedPositionInput {
  quantity: number;
  avgPrice: number;
  /** Divisa del coste (`avgPrice`). */
  currency: string;
}

/** Último cierre de un instrumento, en su divisa nativa. */
export interface DisplayPrice {
  close: number;
  currency: string;
}

/** Coste y valor de mercado de una posición, los dos en la misma divisa. */
export interface DisplayValuation {
  invested: number;
  marketValue: number;
}

/**
 * La regla de "posición valorable": coste (desde la divisa de la posición) y valor de mercado
 * (desde la del precio, que puede ser otra) convertidos a `display`, o `null` si falta alguna de
 * las dos tasas. Exigir AMBAS es lo que hace que P&L = valor − invertido cuadre y que los pesos
 * del reparto sumen el total.
 */
export function valueInDisplay(
  position: ValuedPositionInput,
  price: DisplayPrice,
  rates: Readonly<Record<string, number>>,
  display: string,
): DisplayValuation | null {
  const invested = convertCurrency(position.quantity * position.avgPrice, position.currency, display, rates);
  const marketValue = convertCurrency(position.quantity * price.close, price.currency, display, rates);
  return invested === null || marketValue === null ? null : { invested, marketValue };
}

/** Entrada mínima para agregar, independiente de los tipos de la app. */
export interface AggregateInput {
  positions: (ValuedPositionInput & {
    ticker: string;
    /** Los derivados no se valoran y quedan fuera del total; es obligatorio para que no se mezclen en el P&L. */
    isDerivative: boolean;
  })[];
  prices: Record<string, DisplayPrice>;
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
 * Agrega la cartera a `display`. Cuenta una posición con precio y ambas divisas convertibles (ver
 * `valueInDisplay`). Invertido, valor y P&L usan el mismo subconjunto para que P&L = valor −
 * invertido cuadre.
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
    const valuation = valueInDisplay(p, price, rates, display);
    if (valuation === null) continue;

    invested += valuation.invested;
    marketValue += valuation.marketValue;
    valued += 1;
  }

  const pnlAbs = marketValue - invested;
  const pnlPct = invested > 0 ? (pnlAbs / invested) * 100 : null;
  return { invested, marketValue, pnlAbs, pnlPct, valued, total: tracked.length, display };
}
