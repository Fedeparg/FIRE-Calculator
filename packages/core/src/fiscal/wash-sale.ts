// Regla de los dos meses (art. 33.5.f LIRPF): pérdidas por transmisión de valores cotizados que
// no se computan porque se recompran valores homogéneos en los dos meses anteriores o
// posteriores. Core puro, sin conversión de divisas: trabaja en la divisa de la posición.
// Criterios, supuestos y fuentes: ver ./README.md (sección `wash-sale.ts`).

import { QUANTITY_EPSILON } from "../inputs.js";
import { addMonths } from "../dates.js";
import { compareTradeLots, walkLots, type LotWalk, type RealisedSale, type TradeLot } from "./plusvalias.js";

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

/** Estado de una compra: parte libre (que aún no bloquea ninguna pérdida) y pérdidas que bloquea. */
interface PurchaseState {
  /** Fracción de las participaciones vivas que no bloquea nada (0..1); es independiente de la unidad. */
  free: number;
  tags: { saleId: string; loss: number }[];
}

/** Estado de las compras que han bloqueado alguna pérdida, por id de lote. */
type PurchaseStates = Map<string, PurchaseState>;

/** Compra de la ventana de una venta con capacidad para bloquear títulos. */
interface WindowCandidate {
  lotId: string;
  /** Títulos que aún puede bloquear para ESTA venta. */
  capacity: number;
  /**
   * Títulos sobre los que se expresa su parte libre: los vivos tras la venta (compras anteriores)
   * o los comprados (posteriores).
   */
  reference: number;
}

/**
 * Capacidad de bloqueo de las compras de la ventana de una venta. Cada título comprado bloquea
 * como mucho una vez: lo que se bloquea aquí se descuenta de la parte libre de su compra
 * (`PurchaseState.free`) y deja de estar disponible para ventas posteriores.
 */
class WindowCapacity {
  constructor(
    private readonly candidates: WindowCandidate[],
    private readonly states: PurchaseStates,
  ) {}

  /** Títulos que aún se pueden bloquear en la ventana. */
  free(): number {
    return this.candidates.reduce((sum, c) => sum + c.capacity, 0);
  }

  /**
   * Bloquea `quantity` títulos de las compras de la ventana (las más antiguas primero),
   * repartiendo `losses` (pérdida por venta de origen) en proporción a lo que bloquea cada una.
   */
  block(quantity: number, losses: ReadonlyMap<string, number>): void {
    let remaining = quantity;
    for (const candidate of this.candidates) {
      const taken = Math.min(candidate.capacity, remaining);
      if (taken <= QUANTITY_EPSILON) continue;
      const state = this.stateOf(candidate.lotId);
      state.free = Math.max(0, state.free - taken / candidate.reference);
      candidate.capacity -= taken;
      for (const [saleId, loss] of losses) state.tags.push({ saleId, loss: (loss * taken) / quantity });
      remaining -= taken;
    }
  }

  private stateOf(lotId: string): PurchaseState {
    const existing = this.states.get(lotId);
    if (existing) return existing;
    const created: PurchaseState = { free: 1, tags: [] };
    this.states.set(lotId, created);
    return created;
  }
}

/**
 * Paso 1: la venta transmite títulos que bloqueaban pérdidas de ventas anteriores. La parte
 * proporcional de cada pérdida se libera (deja de estar en la compra) y se devuelve por venta de
 * origen; si se integra o vuelve a diferirse lo decide el paso 3.
 */
function releaseBlockedLosses(
  sale: RealisedSale,
  states: PurchaseStates,
  aliveAfter: ReadonlyMap<string, number>,
): { released: Map<string, number>; releasedQuantity: number } {
  const released = new Map<string, number>();
  let releasedQuantity = 0;
  for (const piece of sale.matched) {
    const state = states.get(piece.lotId);
    if (!state || state.tags.every((tag) => tag.loss === 0)) continue;
    const before = piece.quantity + (aliveAfter.get(piece.lotId) ?? 0);
    const sold = Math.min(1, piece.quantity / before);
    releasedQuantity += piece.quantity;
    for (const tag of state.tags) {
      const part = tag.loss * sold;
      tag.loss -= part;
      released.set(tag.saleId, (released.get(tag.saleId) ?? 0) + part);
    }
  }
  return { released, releasedQuantity };
}

/** Compras de la ventana de dos meses de la venta (ambos extremos incluidos) con capacidad libre. */
function collectWindowCandidates(
  sale: RealisedSale,
  purchases: readonly TradeLot[],
  orderOf: ReadonlyMap<string, number>,
  aliveAfter: ReadonlyMap<string, number>,
  states: PurchaseStates,
): WindowCapacity {
  const saleOrder = orderOf.get(sale.lotId) ?? Infinity;
  const windowStart = addMonths(sale.tradedAt, -2);
  const windowEnd = addMonths(sale.tradedAt, 2);
  const candidates: WindowCandidate[] = [];
  for (const purchase of purchases) {
    if (purchase.tradedAt < windowStart || purchase.tradedAt > windowEnd) continue;
    const before = (orderOf.get(purchase.id) ?? Infinity) < saleOrder;
    const reference = before ? (aliveAfter.get(purchase.id) ?? 0) : purchase.quantity;
    const capacity = (states.get(purchase.id)?.free ?? 1) * reference;
    if (capacity > QUANTITY_EPSILON) candidates.push({ lotId: purchase.id, capacity, reference });
  }
  return new WindowCapacity(candidates, states);
}

/**
 * Paso 2: la pérdida propia de la venta (sus trozos FIFO con pérdida) queda diferida en la
 * proporción de títulos que la ventana puede bloquear.
 */
function deferOwnLoss(sale: RealisedSale, capacity: WindowCapacity, entry: SaleWashSale): void {
  const lossPieces = sale.matched.filter((m) => m.gain < 0);
  const lossQuantity = lossPieces.reduce((sum, m) => sum + m.quantity, 0);
  if (lossQuantity <= QUANTITY_EPSILON) return;
  const blocked = Math.min(lossQuantity, capacity.free());
  if (blocked <= QUANTITY_EPSILON) return;
  const deferred = (lossPieces.reduce((sum, m) => sum + m.gain, 0) * blocked) / lossQuantity;
  capacity.block(blocked, new Map([[sale.lotId, deferred]]));
  entry.deferredLoss = deferred;
  entry.deferredQuantity = blocked;
}

/**
 * Paso 3: una transmisión es definitiva si en los dos meses anteriores o posteriores no se
 * adquieren valores homogéneos. Si hay recompra, la parte proporcional de lo liberado vuelve a
 * quedar diferida (con su venta de origen) en las compras que aún tengan capacidad libre; el
 * resto se integra en esta venta.
 */
function integrateReleased(
  released: ReadonlyMap<string, number>,
  releasedQuantity: number,
  capacity: WindowCapacity,
  entry: SaleWashSale,
): void {
  const redeferred = Math.min(releasedQuantity, capacity.free());
  const ratio = redeferred > QUANTITY_EPSILON && releasedQuantity > 0 ? redeferred / releasedQuantity : 0;
  if (ratio > 0) {
    capacity.block(redeferred, new Map([...released].map(([saleId, loss]) => [saleId, loss * ratio])));
  }
  for (const [fromSaleId, loss] of released) {
    const integrated = loss * (1 - ratio);
    if (integrated === 0) continue;
    entry.integratedFrom.push({ fromSaleId, loss: integrated });
    entry.integratedLoss += integrated;
  }
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
 *   (FIFO) «de forma definitiva»: si esa venta tiene a su vez una recompra en su ventana (sea con
 *   ganancia o con pérdida), la parte proporcional sigue diferida y pasa a los nuevos títulos.
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

  const states: PurchaseStates = new Map();
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

    // El orden de los pasos importa: lo liberado (1) se calcula antes de que la venta consuma
    // capacidad de su ventana con su propia pérdida (2), que tiene prioridad sobre volver a
    // diferir lo liberado (3).
    const { released, releasedQuantity } = releaseBlockedLosses(sale, states, aliveAfter);
    const capacity = collectWindowCandidates(sale, purchases, orderOf, aliveAfter, states);
    deferOwnLoss(sale, capacity, entry);
    integrateReleased(released, releasedQuantity, capacity, entry);
  }

  return result;
}
