// Informe anual de ganancias y pérdidas patrimoniales realizadas: ventas registradas,
// emparejadas por FIFO (`walkLots`), pasadas a euros, agrupadas por ejercicio y compensadas
// dentro de él. Core puro. Alcance, criterio de divisas y fuentes: ver ./README.md.

import { referenceRateOn, TAX_CURRENCY, toEur, type AppliedRate, type ReferenceRates } from "./fx-reference.js";
import {
  walkLots,
  estimateSavingsTax,
  type RealisedSale,
  type SavingsTaxEstimate,
  type TradeLot,
} from "./plusvalias.js";

export { TAX_CURRENCY };

/** Una posición con su histórico, tal y como la tiene la cartera. */
export interface RealisedGainsPosition {
  id: string;
  ticker: string;
  name: string | null;
  currency: string;
  lots: readonly TradeLot[];
}

/**
 * Venta en divisa pasada a euros con el criterio de la DGT: la ganancia se calcula en la divisa
 * y se convierte al tipo del día de la venta; la diferencia de cambio de la divisa invertida es
 * otra ganancia o pérdida aparte. En euros, `fxDifference` es 0 y el tipo es 1.
 */
export interface SaleInEur {
  /** Tipo del día de la venta, el que convierte los valores de transmisión y adquisición. */
  sellRate: AppliedRate;
  transferValue: number;
  acquisitionValue: number;
  gain: number;
  /**
   * Diferencia de cambio de la divisa con la que se compró lo vendido, suponiendo que se compró
   * con euros cambiados ese día y que lo cobrado se cambia a euros el día de la venta (lo que
   * hace un bróker con cuenta en euros). `null` si falta el tipo de alguna compra.
   */
  fxDifference: number | null;
  /** Tipo del día de cada compra emparejada, alineado con `matched`. */
  buyRates: (AppliedRate | null)[];
}

/** Venta del informe con su posición; es la fila del CSV. Los importes de `RealisedSale` van en la divisa de la posición. */
export interface RealisedGainsSale extends RealisedSale {
  positionId: string;
  ticker: string;
  name: string | null;
  currency: string;
  /** La venta en euros, o `null` si no hay tipo de referencia para el día de la venta. */
  eur: SaleInEur | null;
}

/** Ventas de una posición en un ejercicio, sumadas y en euros. */
export interface RealisedGainsRow {
  positionId: string;
  ticker: string;
  name: string | null;
  currency: string;
  /** Número de ventas de la posición en el ejercicio. */
  sales: number;
  quantity: number;
  transferValue: number;
  acquisitionValue: number;
  gain: number;
  /** Suma de las diferencias de cambio conocidas de esas ventas. */
  fxDifference: number;
}

/** Ventas de una divisa que no se han podido pasar a euros, en esa divisa. */
export interface RealisedGainsUnconverted {
  currency: string;
  sales: number;
  /** Saldo de esas ventas, en la divisa. */
  gain: number;
}

export interface RealisedGainsYear {
  year: number;
  /** Posiciones con ventas convertidas, por símbolo. */
  rows: RealisedGainsRow[];
  /** Todas las ventas del ejercicio, en orden cronológico (las no convertidas con `eur: null`). */
  sales: RealisedGainsSale[];
  /** Suma de las ventas con ganancia, en euros. */
  gains: number;
  /** Suma de las ventas con pérdida (≤ 0), en euros. */
  losses: number;
  /** Saldo de las ventas de valores: `gains + losses`. */
  net: number;
  /** Saldo de las diferencias de cambio conocidas. */
  fxDifference: number;
  /** Ventas en divisa cuya diferencia de cambio no se pudo calcular (falta el tipo de alguna compra). */
  fxIncomplete: number;
  /** Ventas sin tipo de referencia el día de la venta, por divisa: fuera de los totales. */
  unconverted: RealisedGainsUnconverted[];
  /** Saldo que se integra en la base del ahorro: `net + fxDifference`. */
  total: number;
  /** Cuota estimada sobre `total`; con pérdida neta, 0 (no se arrastra). */
  tax: SavingsTaxEstimate;
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

/** Pasa una venta a euros con el criterio de la DGT, o `null` si falta el tipo del día de la venta. */
function convertSale(sale: RealisedSale, currency: string, rates: ReferenceRates): SaleInEur | null {
  const sellRate = referenceRateOn(rates, currency, sale.tradedAt);
  if (!sellRate) return null;

  const buyRates = sale.matched.map((m) => referenceRateOn(rates, currency, m.tradedAt));
  let fxDifference: number | null = 0;
  if (currency !== TAX_CURRENCY) {
    for (const [i, m] of sale.matched.entries()) {
      const buyRate = buyRates[i];
      if (!buyRate || fxDifference === null) {
        fxDifference = null;
        break;
      }
      // Divisa invertida en ese lote: costó `toEur(A, compra)` y vuelve a euros a `toEur(A, venta)`.
      fxDifference += toEur(m.acquisitionValue, sellRate) - toEur(m.acquisitionValue, buyRate);
    }
  }

  return {
    sellRate,
    transferValue: toEur(sale.transferValue, sellRate),
    acquisitionValue: toEur(sale.acquisitionValue, sellRate),
    gain: toEur(sale.gain, sellRate),
    fxDifference,
    buyRates,
  };
}

/**
 * Construye el informe desde las posiciones y su histórico; solo aparecen las que tienen ventas.
 * `rates` son los tipos de referencia del BCE de las divisas distintas del euro.
 */
export function buildRealisedGainsReport(
  positions: readonly RealisedGainsPosition[],
  rates: ReferenceRates,
): RealisedGainsReport {
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
        eur: convertSale(sale, position.currency, rates),
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

  const rows = new Map<string, RealisedGainsRow>();
  const unconverted = new Map<string, RealisedGainsUnconverted>();
  let gains = 0;
  let losses = 0;
  let fxDifference = 0;
  let fxIncomplete = 0;

  for (const sale of ordered) {
    const { eur } = sale;
    if (!eur) {
      const entry = unconverted.get(sale.currency) ?? { currency: sale.currency, sales: 0, gain: 0 };
      entry.sales += 1;
      entry.gain += sale.gain;
      unconverted.set(sale.currency, entry);
      continue;
    }

    if (eur.gain >= 0) gains += eur.gain;
    else losses += eur.gain;
    if (eur.fxDifference === null) fxIncomplete += 1;
    else fxDifference += eur.fxDifference;

    const row = rows.get(sale.positionId) ?? {
      positionId: sale.positionId,
      ticker: sale.ticker,
      name: sale.name,
      currency: sale.currency,
      sales: 0,
      quantity: 0,
      transferValue: 0,
      acquisitionValue: 0,
      gain: 0,
      fxDifference: 0,
    };
    row.sales += 1;
    row.quantity += sale.quantity;
    row.transferValue += eur.transferValue;
    row.acquisitionValue += eur.acquisitionValue;
    row.gain += eur.gain;
    row.fxDifference += eur.fxDifference ?? 0;
    rows.set(sale.positionId, row);
  }

  const net = gains + losses;
  const total = net + fxDifference;
  return {
    year,
    rows: [...rows.values()].sort((a, b) => a.ticker.localeCompare(b.ticker)),
    sales: ordered,
    gains,
    losses,
    net,
    fxDifference,
    fxIncomplete,
    unconverted: [...unconverted.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    total,
    // Cuota sobre el saldo compensado; si es negativo, `estimateSavingsTax` da 0.
    tax: estimateSavingsTax(total),
  };
}
