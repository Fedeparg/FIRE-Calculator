// Informe anual de ganancias y pérdidas patrimoniales REALIZADAS: las ventas ya registradas en
// la cartera, emparejadas por FIFO con las mismas reglas que la simulación de venta
// (`walkLots` en `plusvalias.ts`), agrupadas por ejercicio y compensadas dentro de él.
//
// Core puro (sin React, sin fetch), testeable.
//
// ⚠️ ALCANCE FISCAL. Sí modela:
//   - FIFO, valores de adquisición y transmisión con comisiones (ver `plusvalias.ts`).
//   - **FIFO por VALOR, no por posición**: el criterio de los valores homogéneos se aplica a
//     todas las participaciones del contribuyente, estén en el bróker que estén. Si el mismo
//     símbolo está en dos posiciones (dos brókers), una venta en cualquiera de ellas empareja
//     primero la compra más antigua de las dos. Cada venta se sigue atribuyendo a la posición
//     donde se registró.
//   - **Integración y compensación dentro del ejercicio** (art. 49.1.b LIRPF): las ganancias y
//     pérdidas por transmisión del mismo año se suman entre sí, y la cuota se estima sobre el
//     saldo si es positivo.
//
// NO modela (el informe lo dice en pantalla):
//   - Los **saldos negativos de los cuatro ejercicios anteriores** (art. 49.1.b, último
//     párrafo): un año con pérdida neta da cuota 0 y ese saldo no se arrastra aquí.
//   - La **compensación cruzada del 25 %** con los rendimientos del capital mobiliario
//     (dividendos, intereses), que la cartera no registra.
//   - La **regla de los dos meses** (art. 33.5.f).
//   - La **conversión a euros** de las posiciones en otra divisa. Hacienda exige el cambio
//     oficial de la fecha de compra y de la de venta, y la aplicación solo guarda unos días de
//     histórico de tipos de cambio: convertir con el cambio de hoy daría una cifra fiscalmente
//     falsa. Por eso los importes se agrupan por divisa y la cuota solo se estima sobre el
//     grupo en euros.

import { walkLots, estimateSavingsTax, type RealisedSale, type SavingsTaxEstimate, type TradeLot } from "./plusvalias.js";

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

/** Una venta del informe, con la posición a la que pertenece. Es la fila del CSV. */
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

/**
 * Clave de "valor homogéneo": mismo símbolo (sin distinguir mayúsculas) y misma divisa. La
 * divisa entra en la clave porque los importes de dos divisas no se pueden emparejar entre sí.
 */
function securityKey(position: RealisedGainsPosition): string {
  return `${position.ticker.trim().toUpperCase()}\u0000${position.currency}`;
}

/**
 * Construye el informe a partir de las posiciones y su histórico. Las posiciones sin ventas no
 * aparecen; una posición ya vendida del todo sí, porque sus ventas cuentan.
 */
export function buildRealisedGainsReport(
  positions: readonly RealisedGainsPosition[],
): RealisedGainsReport {
  const bySecurity = new Map<string, RealisedGainsPosition[]>();
  for (const position of positions) {
    const key = securityKey(position);
    bySecurity.set(key, [...(bySecurity.get(key) ?? []), position]);
  }

  const byYear = new Map<number, RealisedGainsSale[]>();

  for (const group of bySecurity.values()) {
    // Todas las operaciones del valor juntas: el FIFO se hace sobre el conjunto.
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

  const years = [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, sales]) => buildYear(year, sales));

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
    // La cuota se estima sobre el SALDO compensado; si es negativo, `estimateSavingsTax` da 0.
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
