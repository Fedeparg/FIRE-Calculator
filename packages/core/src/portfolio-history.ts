/**
 * Reconstrucción del histórico de valoración de la cartera a partir de las OPERACIONES
 * (lotes), no de la foto de hoy. Core puro (sin React ni BD), testeable.
 *
 * Cada día se valora lo que se tenía ESE día: cantidad y coste medio vigentes según los lotes
 * con `tradedAt <= día`, al cierre de ese día y con las tasas FX de ese día. Antes de la primera
 * compra de una posición no hay nada que valorar (no se inventa historia), y tras venderla
 * entera tampoco. La valoración en sí NO se reimplementa: cada día pasa por `aggregatePortfolio`
 * (`core/fx.ts`), la misma fórmula que ve la cartera.
 *
 * SPLITS: los cierres de la fuente vienen AJUSTADOS por splits (todos están expresados en
 * acciones de hoy), pero las cantidades de los lotes son las crudas de cada operación. Sin
 * corregirlo, antes de un split 10:1 la serie valdría 10 veces menos y daría un salto artificial
 * en la fecha del split. Por eso la cantidad de cada lote se multiplica por el ratio acumulado de
 * los splits POSTERIORES a su fecha (y su precio se divide, para que el coste `cantidad · precio`
 * no cambie). Supone que los lotes llevan la cantidad cruda de la operación, no ya reajustada.
 * Los splits se reconsultan a la fuente cada 7 días: un split reciente puede tardar hasta una
 * semana en reflejarse (al reconsultar, los cierres antiguos también se reajustan).
 *
 * LIMITACIÓN: los bonus/regalos de bróker (p. ej. acciones gratis de Trade Republic) llegan como
 * una compra a precio 0; entran con coste 0 y bajan el precio medio, tal cual, sin tratamiento
 * especial. Ni las acciones corporativas distintas de splits (fusiones, spin-offs) ni los
 * dividendos están modelados.
 *
 * Aritmética: `number` (doble precisión), igual que `aggregatePortfolio`. La fuente exacta
 * (decimal de coma fija) de `quantity`/`avgPrice` sigue siendo la agregación de lotes de la API;
 * esta serie es una estimación para la gráfica, no un dato contable.
 */

import { aggregatePortfolio, type AggregateInput, type PortfolioAggregate } from "./fx.js";

/**
 * Días máximos que se arrastra el último cierre/tasa conocido cuando un día no tiene dato propio
 * (fines de semana, festivos, un hueco de la fuente). Pasado ese margen el instrumento se da por
 * SIN precio ese día en vez de repetir un cierre rancio durante semanas: preferimos un hueco en
 * la serie a un valor inventado. 10 días cubren puentes largos (Semana Santa, Navidad).
 */
export const MAX_CARRY_FORWARD_DAYS = 10;

/** Por debajo de esto una cantidad se considera cero (ruido de redondeo de los 6 decimales). */
const QUANTITY_EPSILON = 1e-9;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Operación de una posición. */
export interface HistoryLot {
  kind: "buy" | "sell";
  quantity: number;
  /** Precio unitario en la divisa de la posición. */
  price: number;
  /** Fecha de la operación, YYYY-MM-DD. */
  tradedAt: string;
}

/** Posición con todas sus operaciones. */
export interface HistoryPosition {
  ticker: string;
  /** Divisa del coste (`avgPrice` / precio de los lotes). */
  currency: string;
  isDerivative: boolean;
  /**
   * Lotes de la posición. Los del mismo día se procesan en el orden recibido (el llamante pasa
   * el orden canónico `createdAt, id`), que importa: vender y recomprar el mismo día no da el
   * mismo coste medio que recomprar y vender.
   */
  lots: readonly HistoryLot[];
}

/** Cierre diario de un instrumento, en su divisa nativa. */
export interface PricePoint {
  date: string;
  close: number;
  currency: string;
}

/** Tasa diaria de una divisa: USD por unidad (la misma convención que `aggregatePortfolio`). */
export interface FxPoint {
  date: string;
  rate: number;
}

/** Split de un instrumento: `ratio` = nuevas por cada antigua (10 para un 10:1, 0,5 para un 1:2 inverso). */
export interface SplitPoint {
  /** Primer día cotizando ya con el split (YYYY-MM-DD). */
  date: string;
  ratio: number;
}

export interface HistoryInput {
  positions: readonly HistoryPosition[];
  /** Serie de cierres por ticker, ordenada por fecha ascendente. */
  prices: Readonly<Record<string, readonly PricePoint[]>>;
  /** Serie de tasas por divisa (USD por unidad), ordenada por fecha ascendente. USD no hace falta. */
  fx: Readonly<Record<string, readonly FxPoint[]>>;
  /** Splits por ticker (opcional). Ver la cabecera: corrigen la cantidad cruda de los lotes. */
  splits?: Readonly<Record<string, readonly SplitPoint[]>>;
  /** Primer y último día a reconstruir, ambos inclusive (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Divisa en la que se expresan los importes. */
  display: string;
}

/** Valoración de un día. */
export interface HistoryDay {
  date: string;
  aggregate: PortfolioAggregate;
  /** Tasas FX vigentes ese día (USD por unidad, USD = 1), para reexpresar la serie después. */
  rates: Record<string, number>;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + MS_PER_DAY).toISOString().slice(0, 10);
}

/** Cursor sobre una serie ordenada: avanza con la fecha y arrastra el último punto conocido. */
class SeriesCursor<T extends { date: string }> {
  private index = -1;

  constructor(private readonly series: readonly T[]) {}

  /** Último punto con `date <= day`, o `null` si no hay ninguno o es más viejo que el margen. */
  at(day: string): T | null {
    while (this.index + 1 < this.series.length && this.series[this.index + 1].date <= day) {
      this.index += 1;
    }
    if (this.index < 0) return null;
    const point = this.series[this.index];
    return daysBetween(point.date, day) <= MAX_CARRY_FORWARD_DAYS ? point : null;
  }
}

/** Estado vivo de una posición mientras se recorren los lotes: cantidad y coste acumulado. */
interface Holding {
  quantity: number;
  cost: number;
}

/** Aplica una operación con coste medio móvil: la compra suma coste, la venta retira al medio. */
function applyLot(holding: Holding, lot: HistoryLot): void {
  if (lot.kind === "buy") {
    holding.quantity += lot.quantity;
    holding.cost += lot.quantity * lot.price;
    return;
  }
  // Vender más de lo que hay (no se admiten cortos) se acota a lo que hay.
  const sold = Math.min(lot.quantity, holding.quantity);
  const remaining = holding.quantity - sold;
  if (remaining <= QUANTITY_EPSILON) {
    holding.quantity = 0;
    holding.cost = 0;
    return;
  }
  holding.cost = (holding.cost * remaining) / holding.quantity;
  holding.quantity = remaining;
}

/**
 * Expresa los lotes en acciones de hoy: cantidad × ratio de los splits posteriores a la fecha del
 * lote, precio ÷ ese ratio (el coste no cambia). Un split del mismo día de la operación no cuenta:
 * la operación ya se hizo a precio post-split.
 */
function adjustForSplits(lots: readonly HistoryLot[], splits: readonly SplitPoint[]): HistoryLot[] {
  return lots.map((lot) => {
    let factor = 1;
    for (const split of splits) {
      if (split.date > lot.tradedAt && Number.isFinite(split.ratio) && split.ratio > 0) factor *= split.ratio;
    }
    return factor === 1 ? lot : { ...lot, quantity: lot.quantity * factor, price: lot.price / factor };
  });
}

/**
 * Primera fecha en que el usuario tuvo algo: la operación más antigua de todas las posiciones,
 * o `null` si no hay ninguna. Sirve para acotar desde dónde reconstruir.
 */
export function firstTradeDate(positions: readonly HistoryPosition[]): string | null {
  let first: string | null = null;
  for (const position of positions) {
    for (const lot of position.lots) {
      if (first === null || lot.tradedAt < first) first = lot.tradedAt;
    }
  }
  return first;
}

/**
 * Valoración día a día entre `from` y `to` (inclusive). Los días en que no se pudo valorar
 * NINGUNA posición (cartera vacía, aún sin comprar, ya todo vendido, sin precio ni tasa) se
 * OMITEN: no hay nada honesto que guardar. Un día en que solo algunas posiciones tienen precio
 * se devuelve con `aggregate.valued < aggregate.total`, igual que la captura diaria.
 *
 * Una pasada lineal: cada serie y la lista de lotes de cada posición se recorren UNA vez con un
 * cursor, así que el coste es O(días + lotes + puntos de precio), no O(días × lotes).
 */
export function reconstructHistory(input: HistoryInput): HistoryDay[] {
  const { positions, prices, fx, splits = {}, from, to, display } = input;
  if (from > to) return [];

  const state = positions.map((position) => ({
    position,
    // Orden estable por fecha: los lotes del mismo día conservan el orden recibido.
    lots: adjustForSplits(position.lots, splits[position.ticker] ?? []).sort((a, b) =>
      a.tradedAt < b.tradedAt ? -1 : a.tradedAt > b.tradedAt ? 1 : 0,
    ),
    next: 0,
    holding: { quantity: 0, cost: 0 } as Holding,
    price: new SeriesCursor(prices[position.ticker] ?? []),
  }));
  const fxCursors = Object.entries(fx).map(([currency, series]) => ({
    currency,
    cursor: new SeriesCursor(series),
  }));

  const days: HistoryDay[] = [];
  for (let day = from; day <= to; day = nextDay(day)) {
    const rates: Record<string, number> = { USD: 1 };
    for (const { currency, cursor } of fxCursors) {
      const point = cursor.at(day);
      if (point && Number.isFinite(point.rate) && point.rate > 0) rates[currency] = point.rate;
    }

    const held: AggregateInput["positions"] = [];
    const dayPrices: AggregateInput["prices"] = {};
    for (const entry of state) {
      while (entry.next < entry.lots.length && entry.lots[entry.next].tradedAt <= day) {
        applyLot(entry.holding, entry.lots[entry.next]);
        entry.next += 1;
      }
      if (entry.holding.quantity <= QUANTITY_EPSILON) continue; // aún sin comprar, o ya vendida

      const { ticker, currency, isDerivative } = entry.position;
      held.push({
        ticker,
        quantity: entry.holding.quantity,
        avgPrice: entry.holding.cost / entry.holding.quantity,
        currency,
        isDerivative,
      });
      const close = entry.price.at(day);
      if (close) dayPrices[ticker] = { close: close.close, currency: close.currency };
    }

    const aggregate = aggregatePortfolio({ positions: held, prices: dayPrices, rates, display });
    if (aggregate.valued === 0) continue;
    days.push({ date: day, aggregate, rates });
  }
  return days;
}
