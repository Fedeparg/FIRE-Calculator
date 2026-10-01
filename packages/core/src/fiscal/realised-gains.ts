// Informe anual de ganancias y pérdidas patrimoniales realizadas: ventas registradas,
// emparejadas por FIFO (`walkLots`), agrupadas por ejercicio y compensadas dentro de él.
// Core puro. Alcance y supuestos fiscales: ver ./README.md.

import {
  walkLots,
  estimateSavingsTax,
  type RealisedSale,
  type SavingsTaxEstimate,
  type TradeLot,
} from "./plusvalias.js";

/** Divisa sobre la que se estima la cuota (la del IRPF). */
export const TAX_CURRENCY = "EUR";

/** Una posición con su histórico, tal y como la tiene la cartera. */
export interface RealisedGainsPosition {
  id: string;
  ticker: string;
  name: string | null;
  currency: string;
  lots: readonly TradeLot[];
}

/** Venta del informe con su posición; es la fila del CSV. */
export interface RealisedGainsSale extends RealisedSale {
  positionId: string;
  ticker: string;
  name: string | null;
  currency: string;
}

/** Ventas de una posición en un ejercicio, sumadas. */
export interface RealisedGainsRow {
  positionId: string;
  ticker: string;
  name: string | null;
  /** Número de ventas de la posición en el ejercicio. */
  sales: number;
  quantity: number;
  transferValue: number;
  acquisitionValue: number;
  gain: number;
}

/** Todo lo vendido en una divisa en un ejercicio. */
export interface RealisedGainsCurrencyGroup {
  currency: string;
  rows: RealisedGainsRow[];
  /** Suma de las ventas con ganancia. */
  gains: number;
  /** Suma de las ventas con pérdida (≤ 0). */
  losses: number;
  /** Saldo del ejercicio en esta divisa: ganancias + pérdidas. */
  net: number;
}

export interface RealisedGainsYear {
  year: number;
  /** Grupos por divisa; el de euros primero, el resto por orden alfabético. */
  groups: RealisedGainsCurrencyGroup[];
  /** Ventas del ejercicio, en orden cronológico. */
  sales: RealisedGainsSale[];
  /** Cuota estimada sobre el saldo en euros, o `null` si no hubo ventas en euros. */
  tax: SavingsTaxEstimate | null;
}

export interface RealisedGainsReport {
  /** Ejercicios con alguna venta, del más reciente al más antiguo. */
  years: RealisedGainsYear[];
}

/** Ejercicio fiscal de una venta: el año natural de su fecha `YYYY-MM-DD`. */
function fiscalYear(tradedAt: string): number {
  return Number(tradedAt.slice(0, 4));
}

/** Clave de valor homogéneo: símbolo (sin mayúsculas) y divisa, pues importes de divisas distintas no se emparejan. */
function securityKey(position: RealisedGainsPosition): string {
  return `${position.ticker.trim().toUpperCase()}\u0000${position.currency}`;
}

/** Construye el informe desde las posiciones y su histórico; solo aparecen las que tienen ventas. */
export function buildRealisedGainsReport(positions: readonly RealisedGainsPosition[]): RealisedGainsReport {
  const bySecurity = new Map<string, RealisedGainsPosition[]>();
  for (const position of positions) {
    const key = securityKey(position);
    bySecurity.set(key, [...(bySecurity.get(key) ?? []), position]);
  }

  const byYear = new Map<number, RealisedGainsSale[]>();

  for (const group of bySecurity.values()) {
    // FIFO sobre todas las operaciones del valor juntas.
    const owner = new Map<string, RealisedGainsPosition>();
    for (const position of group) for (const lot of position.lots) owner.set(lot.id, position);

    for (const sale of walkLots(group.flatMap((p) => p.lots)).sales) {
      // Una venta que no emparejó nada (histórico incoherente) no realiza ninguna ganancia.
      if (sale.quantity <= 0) continue;
      const year = fiscalYear(sale.tradedAt);
      const position = owner.get(sale.lotId);
      if (!Number.isInteger(year) || !position) continue;
      const list = byYear.get(year) ?? [];
      list.push({
        ...sale,
        positionId: position.id,
        ticker: position.ticker,
        name: position.name,
        currency: position.currency,
      });
      byYear.set(year, list);
    }
  }

  const years = [...byYear.entries()].sort(([a], [b]) => b - a).map(([year, sales]) => buildYear(year, sales));

  return { years };
}

function buildYear(year: number, sales: RealisedGainsSale[]): RealisedGainsYear {
  const ordered = [...sales].sort((a, b) =>
    a.tradedAt !== b.tradedAt ? (a.tradedAt < b.tradedAt ? -1 : 1) : a.ticker.localeCompare(b.ticker),
  );

  const byCurrency = new Map<string, RealisedGainsSale[]>();
  for (const sale of ordered) {
    const list = byCurrency.get(sale.currency) ?? [];
    list.push(sale);
    byCurrency.set(sale.currency, list);
  }

  const groups = [...byCurrency.entries()]
    .sort(([a], [b]) => (a === TAX_CURRENCY ? -1 : b === TAX_CURRENCY ? 1 : a.localeCompare(b)))
    .map(([currency, list]) => buildGroup(currency, list));

  const eur = groups.find((g) => g.currency === TAX_CURRENCY);
  return {
    year,
    groups,
    sales: ordered,
    // Cuota sobre el saldo compensado; si es negativo, `estimateSavingsTax` da 0.
    tax: eur ? estimateSavingsTax(eur.net) : null,
  };
}

function buildGroup(currency: string, sales: RealisedGainsSale[]): RealisedGainsCurrencyGroup {
  const rows = new Map<string, RealisedGainsRow>();
  let gains = 0;
  let losses = 0;

  for (const sale of sales) {
    if (sale.gain >= 0) gains += sale.gain;
    else losses += sale.gain;

    const row = rows.get(sale.positionId) ?? {
      positionId: sale.positionId,
      ticker: sale.ticker,
      name: sale.name,
      sales: 0,
      quantity: 0,
      transferValue: 0,
      acquisitionValue: 0,
      gain: 0,
    };
    row.sales += 1;
    row.quantity += sale.quantity;
    row.transferValue += sale.transferValue;
    row.acquisitionValue += sale.acquisitionValue;
    row.gain += sale.gain;
    rows.set(sale.positionId, row);
  }

  return {
    currency,
    rows: [...rows.values()].sort((a, b) => a.ticker.localeCompare(b.ticker)),
    gains,
    losses,
    net: gains + losses,
  };
}
