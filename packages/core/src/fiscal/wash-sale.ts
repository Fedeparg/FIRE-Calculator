// Regla de los dos meses (art. 33.5.f LIRPF): pérdidas por transmisión de valores cotizados que
// no se computan porque se recompran valores homogéneos en los dos meses anteriores o
// posteriores. Core puro, sin conversión de divisas: trabaja en la divisa de la posición.
// Criterios, supuestos y fuentes: ver ./README.md (sección `wash-sale.ts`).

import { compareTradeLots, walkLots, type LotWalk, type TradeLot } from "./plusvalias.js";

/** Parte de una pérdida diferida que se integra en una venta posterior. */
export interface WashSaleIntegration {
  /** Id de la venta que difirió la pérdida. */
  fromSaleId: string;
  /** Pérdida que se integra (≤ 0), en la divisa de la posición. */
  loss: number;
}

/** Efecto de la regla en una venta, en la divisa de la posición. */
export interface SaleWashSale {
  /** Id de la venta (el del lote de venta). */
  saleId: string;
  /** Pérdida de esta venta que no se computa por ahora (≤ 0). 0 si no hay recompra homogénea. */
  deferredLoss: number;
  /** Títulos vendidos con pérdida que quedan bloqueados por las compras homogéneas. */
  deferredQuantity: number;
  /** Pérdida de ventas anteriores que se integra en esta, al transmitirse los valores que las bloquearon (≤ 0). */
  integratedLoss: number;
  /** Desglose de `integratedLoss` por venta de origen. */
  integratedFrom: WashSaleIntegration[];
}

/** Tolerancia: las cantidades tienen 6 decimales, un resto menor es ruido binario. */
const QUANTITY_EPSILON = 1e-9;

/** Días del mes de un `YYYY-MM-DD`. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Suma `months` meses a una fecha `YYYY-MM-DD` «de fecha a fecha» (art. 5.1 Código Civil): el
 * 16/07 más dos meses es el 16/09 y menos dos meses, el 16/05. Si el mes de destino no tiene ese
 * día (31/12 + 2 meses), se toma su último día (28/02 o 29/02).
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

/** Estado de una compra: parte libre (que aún no bloquea ninguna pérdida) y pérdidas que bloquea. */
interface PurchaseState {
  /** Fracción de las participaciones vivas que no bloquea nada (0..1); es independiente de la unidad. */
  free: number;
  tags: { saleId: string; loss: number }[];
}

/**
 * Calcula qué parte de la pérdida de cada venta no se computa por la regla de los dos meses y en
 * qué venta posterior se integra. Recibe el histórico de **un valor** (todas sus posiciones
 * juntas, como el FIFO) y, opcionalmente, su `walkLots(lots, { trackOpenLots: true })`; si falta
 * o no trae los lotes vivos, se recalcula. Devuelve una entrada por venta, en orden cronológico.
 *
 * Criterio (interpretación, ver README):
 * - Ventana: de fecha a fecha, ambos extremos incluidos (venta 16/07 → 16/05 a 16/09).
 * - Solo bloquean las compras cuyos títulos siguen en cartera tras la venta (las anteriores) o
 *   que aún no existen (las posteriores). Los títulos vendidos en la propia operación no cuentan.
 * - Las ampliaciones liberadas no son compra: no bloquean (ya están repartidas entre los lotes).
 * - Se analiza cada trozo FIFO de la venta: solo los trozos con pérdida. Si los títulos
 *   recomprados son menos que los vendidos con pérdida, se difiere la parte proporcional.
 * - Cada título comprado bloquea como mucho una vez; varias ventas se atienden por orden
 *   cronológico y cada una consume las compras más antiguas de su ventana primero.
 * - La pérdida se integra, en la proporción en que se vendan, cuando se transmiten esos títulos
 *   (FIFO). Una pérdida ya integrada no vuelve a diferirse.
 *
 * Los derivados no están sujetos (DGT V2172-21): no se debe llamar con su histórico.
 */
export function computeWashSales(lots: readonly TradeLot[], walk?: LotWalk): Map<string, SaleWashSale> {
  const tracked = walk?.openAfterSale ? walk : walkLots(lots, { trackOpenLots: true });
  const openAfterSale = tracked.openAfterSale;
  const ordered = [...lots].sort(compareTradeLots);
  const orderOf = new Map(ordered.map((lot, i) => [lot.id, i]));
  const bonus = new Set(tracked.bonusIssueIds);
  const purchases = ordered.filter(
    (lot) => lot.kind === "buy" && Number.isFinite(lot.quantity) && lot.quantity > 0 && !bonus.has(lot.id),
  );

  const states = new Map<string, PurchaseState>();
  const stateOf = (lotId: string): PurchaseState => {
    const existing = states.get(lotId);
    if (existing) return existing;
    const created: PurchaseState = { free: 1, tags: [] };
    states.set(lotId, created);
    return created;
  };

  const result = new Map<string, SaleWashSale>();

  for (const sale of tracked.sales) {
    const aliveAfter = new Map((openAfterSale?.get(sale.lotId) ?? []).map((l) => [l.lotId, l.quantity]));
    const entry: SaleWashSale = {
      saleId: sale.lotId,
      deferredLoss: 0,
      deferredQuantity: 0,
      integratedLoss: 0,
      integratedFrom: [],
    };
    result.set(sale.lotId, entry);

    // 1. Se transmiten títulos que bloqueaban pérdidas: se integra la parte proporcional.
    const integrated = new Map<string, number>();
    for (const piece of sale.matched) {
      const state = states.get(piece.lotId);
      if (!state || state.tags.length === 0) continue;
      const before = piece.quantity + (aliveAfter.get(piece.lotId) ?? 0);
      const sold = Math.min(1, piece.quantity / before);
      for (const tag of state.tags) {
        const released = tag.loss * sold;
        tag.loss -= released;
        integrated.set(tag.saleId, (integrated.get(tag.saleId) ?? 0) + released);
      }
    }
    for (const [fromSaleId, loss] of integrated) {
      if (loss === 0) continue;
      entry.integratedFrom.push({ fromSaleId, loss });
      entry.integratedLoss += loss;
    }

    // 2. Pérdida propia de esta venta: trozos FIFO con pérdida.
    const lossPieces = sale.matched.filter((m) => m.gain < 0);
    const lossQuantity = lossPieces.reduce((sum, m) => sum + m.quantity, 0);
    if (lossQuantity <= QUANTITY_EPSILON) continue;
    const loss = lossPieces.reduce((sum, m) => sum + m.gain, 0);

    const saleOrder = orderOf.get(sale.lotId) ?? Infinity;
    const windowStart = addMonths(sale.tradedAt, -2);
    const windowEnd = addMonths(sale.tradedAt, 2);

    // Compras de la ventana con capacidad libre. `reference` son los títulos sobre los que se
    // expresa su parte libre: los vivos tras la venta (anteriores) o los comprados (posteriores).
    const candidates: { lotId: string; capacity: number; reference: number }[] = [];
    for (const purchase of purchases) {
      if (purchase.tradedAt < windowStart || purchase.tradedAt > windowEnd) continue;
      const before = (orderOf.get(purchase.id) ?? Infinity) < saleOrder;
      const reference = before ? (aliveAfter.get(purchase.id) ?? 0) : purchase.quantity;
      const capacity = (states.get(purchase.id)?.free ?? 1) * reference;
      if (capacity > QUANTITY_EPSILON) candidates.push({ lotId: purchase.id, capacity, reference });
    }

    const blocked = Math.min(
      lossQuantity,
      candidates.reduce((sum, c) => sum + c.capacity, 0),
    );
    if (blocked <= QUANTITY_EPSILON) continue;

    const deferred = (loss * blocked) / lossQuantity;
    let remaining = blocked;
    for (const candidate of candidates) {
      const taken = Math.min(candidate.capacity, remaining);
      if (taken <= QUANTITY_EPSILON) continue;
      const state = stateOf(candidate.lotId);
      state.free = Math.max(0, state.free - taken / candidate.reference);
      state.tags.push({ saleId: sale.lotId, loss: (deferred * taken) / blocked });
      remaining -= taken;
    }
    entry.deferredLoss = deferred;
    entry.deferredQuantity = blocked;
  }

  return result;
}
