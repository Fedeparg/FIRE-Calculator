/**
 * Reconstrucción del histórico de la cartera a partir de las operaciones (lotes). Core puro.
 *
 * Cada día se valora lo vigente ese día (lotes con `tradedAt <= día`, cierre y FX de ese día) con
 * `aggregatePortfolio`; no se inventa historia antes de la primera compra ni tras vender todo.
 *
 * Splits: los cierres de la fuente vienen ajustados (acciones de hoy) pero las cantidades de los
 * lotes son crudas, así que cada lote se multiplica por el ratio de los splits posteriores a su
 * fecha (y su precio se divide, para conservar el coste). Los splits se reconsultan cada 7 días.
 *
 * Limitaciones: los bonus de bróker llegan como compra a precio 0 y bajan el precio medio sin trato
 * especial; no se modelan fusiones, spin-offs ni dividendos. Aritmética en `number`: es una
 * estimación para la gráfica, no un dato contable.
 */

import { itemAt } from "../arrays.js";
import type { TradeLot } from "../fiscal/plusvalias.js";
import { QUANTITY_EPSILON } from "../inputs.js";
import { compareStrings } from "../compare.js";
import { addDays, daysBetween } from "../dates.js";
import { aggregatePortfolio, type AggregateInput, type PortfolioAggregate } from "./aggregate.js";

/**
 * Días máximos que se arrastra el último cierre/tasa cuando un día no tiene dato propio. Pasado el
 * margen no hay precio ese día (mejor un hueco que un cierre rancio); 10 cubre Semana Santa y Navidad.
 */
export const MAX_CARRY_FORWARD_DAYS = 10;

/** Lo que la reconstrucción usa de cada operación. */
export type HistoryLot = Pick<TradeLot, "kind" | "quantity" | "price" | "tradedAt">;

export interface HistoryPosition {
  ticker: string;
  currency: string;
  isDerivative: boolean;
  /** Los del mismo día se procesan en el orden recibido (`createdAt, id`): vender y recomprar no es lo mismo que recomprar y vender. */
  lots: readonly HistoryLot[];
}

export interface PricePoint {
  date: string;
  close: number;
  currency: string;
}

/** Tasa diaria: USD por unidad (convención de `aggregatePortfolio`). */
export interface FxPoint {
  date: string;
  rate: number;
}

/** Split: `ratio` = nuevas por cada antigua (10 para 10:1, 0,5 para inverso 1:2). */
export interface SplitPoint {
  /** Primer día cotizando con el split. */
  date: string;
  ratio: number;
}

export interface HistoryInput {
  positions: readonly HistoryPosition[];
  prices: Readonly<Record<string, readonly PricePoint[]>>;
  /** Tasas por divisa (USD por unidad), ascendentes; USD no hace falta. */
  fx: Readonly<Record<string, readonly FxPoint[]>>;
  splits?: Readonly<Record<string, readonly SplitPoint[]>>;
  from: string;
  to: string;
  display: string;
}

export interface HistoryDay {
  date: string;
  aggregate: PortfolioAggregate;
  rates: Record<string, number>;
}

class SeriesCursor<T extends { date: string }> {
  private index = -1;

  constructor(private readonly series: readonly T[]) {}

  at(day: string): T | null {
    while (this.index + 1 < this.series.length && itemAt(this.series, this.index + 1).date <= day) {
      this.index += 1;
    }
    if (this.index < 0) return null;
    const point = itemAt(this.series, this.index);
    return daysBetween(point.date, day) <= MAX_CARRY_FORWARD_DAYS ? point : null;
  }
}

interface Holding {
  quantity: number;
  cost: number;
}

const emptyHolding = (): Holding => ({ quantity: 0, cost: 0 });

function applyLot(holding: Holding, lot: HistoryLot): void {
  if (lot.kind === "buy") {
    holding.quantity += lot.quantity;
    holding.cost += lot.quantity * lot.price;
    return;
  }
  // no se admiten cortos: se acota a lo que hay
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

/** Expresa los lotes en acciones de hoy; un split del mismo día no cuenta (la operación ya fue a precio post-split). */
function adjustForSplits(lots: readonly HistoryLot[], splits: readonly SplitPoint[]): HistoryLot[] {
  return lots.map((lot) => {
    let factor = 1;
    for (const split of splits) {
      if (split.date > lot.tradedAt && Number.isFinite(split.ratio) && split.ratio > 0) factor *= split.ratio;
    }
    return factor === 1 ? lot : { ...lot, quantity: lot.quantity * factor, price: lot.price / factor };
  });
}

/** Fecha de la operación más antigua, o `null`; acota desde dónde reconstruir. */
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
 * Valoración día a día entre `from` y `to` (inclusive). Se omiten los días sin ninguna posición
 * valorable; si solo algunas tienen precio, `aggregate.valued < aggregate.total`. Una pasada lineal
 * con cursores: O(días + lotes + puntos de precio).
 */
export function reconstructHistory(input: HistoryInput): HistoryDay[] {
  const { positions, prices, fx, splits = {}, from, to, display } = input;
  if (from > to) return [];

  const state = positions.map((position) => ({
    position,
    // orden estable: los lotes del mismo día conservan el recibido
    lots: adjustForSplits(position.lots, splits[position.ticker] ?? []).sort((a, b) =>
      compareStrings(a.tradedAt, b.tradedAt),
    ),
    next: 0,
    holding: emptyHolding(),
    price: new SeriesCursor(prices[position.ticker] ?? []),
  }));
  const fxCursors = Object.entries(fx).map(([currency, series]) => ({
    currency,
    cursor: new SeriesCursor(series),
  }));

  const days: HistoryDay[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const rates: Record<string, number> = { USD: 1 };
    for (const { currency, cursor } of fxCursors) {
      const point = cursor.at(day);
      if (point && Number.isFinite(point.rate) && point.rate > 0) rates[currency] = point.rate;
    }

    const held: AggregateInput["positions"] = [];
    const dayPrices: AggregateInput["prices"] = {};
    for (const entry of state) {
      while (entry.next < entry.lots.length && itemAt(entry.lots, entry.next).tradedAt <= day) {
        applyLot(entry.holding, itemAt(entry.lots, entry.next));
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
