// Two-month rule (regla de los dos meses, art. 33.5.f LIRPF): losses from transfers of listed
// securities that are not computed because homogeneous securities (valores homogéneos) are
// repurchased in the two months before or after. Pure core module, with no currency conversion:
// it works in the position's currency. Criteria, assumptions and sources: see ./README.md
// (section `wash-sale.ts`).

import { QUANTITY_EPSILON } from "../inputs.js";
import { addMonths } from "../dates.js";
import { compareTradeLots, walkLots, type LotWalk, type RealisedSale, type TradeLot } from "./plusvalias.js";

/** Part of a deferred loss that is integrated into a later sale. */
export interface WashSaleIntegration {
  /** Id of the sale that deferred the loss. */
  fromSaleId: string;
  /** Loss being integrated (≤ 0), in the position's currency. */
  loss: number;
}

/** Effect of the rule on a sale, in the position's currency. */
export interface SaleWashSale {
  /** Id of the sale (that of the sale lot). */
  saleId: string;
  /** Loss of this sale not computed for now (≤ 0). 0 if there is no homogeneous repurchase. */
  deferredLoss: number;
  /** Shares sold at a loss that are blocked by the homogeneous purchases. */
  deferredQuantity: number;
  /** Loss from earlier sales integrated into this one, as the securities that blocked them are transferred (≤ 0). */
  integratedLoss: number;
  /** Breakdown of `integratedLoss` by originating sale. */
  integratedFrom: WashSaleIntegration[];
}

/** State of a purchase: free part (not yet blocking any loss) and the losses it blocks. */
interface PurchaseState {
  /** Fraction of the remaining units that blocks nothing (0..1); it is unit-independent. */
  free: number;
  tags: { saleId: string; loss: number }[];
}

/** State of the purchases that have blocked some loss, by lot id. */
type PurchaseStates = Map<string, PurchaseState>;

/** A purchase in a sale's window with capacity to block shares. */
interface WindowCandidate {
  lotId: string;
  /** Shares it can still block for THIS sale. */
  capacity: number;
  /**
   * Shares its free part is expressed over: those held after the sale (earlier purchases) or
   * those bought (later ones).
   */
  reference: number;
}

/**
 * Blocking capacity of the purchases in a sale's window. Each purchased share blocks at most
 * once: what is blocked here is deducted from its purchase's free part (`PurchaseState.free`)
 * and is no longer available to later sales.
 */
class WindowCapacity {
  constructor(
    private readonly candidates: WindowCandidate[],
    private readonly states: PurchaseStates,
  ) {}

  /** Shares that can still be blocked in the window. */
  free(): number {
    return this.candidates.reduce((sum, c) => sum + c.capacity, 0);
  }

  /**
   * Blocks `quantity` shares from the window's purchases (oldest first), splitting `losses`
   * (loss per originating sale) in proportion to what each one blocks.
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
 * Step 1: the sale transfers shares that were blocking losses from earlier sales. The
 * proportional part of each loss is released (it leaves the purchase) and returned per
 * originating sale; step 3 decides whether it is integrated or deferred again.
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

/** Purchases in the sale's two-month window (both ends included) with free capacity. */
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
 * Step 2: the sale's own loss (its FIFO pieces with a loss) is deferred in the proportion of
 * shares the window can block.
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
 * Step 3: a transfer is definitive if no homogeneous securities are acquired in the two months
 * before or after. If there is a repurchase, the proportional part of what was released is
 * deferred again (with its originating sale) on the purchases that still have free capacity; the
 * rest is integrated into this sale.
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
 * Computes which part of each sale's loss is not computed under the two-month rule and into which
 * later sale it is integrated. It receives the history of **one security** (all its positions
 * together, like FIFO) and, optionally, its `walkLots(lots, { trackOpenLots: true })`; if that is
 * missing or lacks the open lots, it is recomputed. Returns one entry per sale, in chronological
 * order.
 *
 * Criterion (interpretation, see README):
 * - Window: date to date, both ends included (sale on 16/07 → 16/05 to 16/09).
 * - Only purchases whose shares are still held after the sale (earlier ones) or do not exist yet
 *   (later ones) block. Shares sold in the transaction itself do not count.
 * - Bonus issues are not purchases: they do not block (they are already spread across the lots).
 * - Each FIFO piece of the sale is analysed: only the pieces with a loss. If fewer shares are
 *   repurchased than were sold at a loss, the proportional part is deferred.
 * - Each purchased share blocks at most once; several sales are handled in chronological order
 *   and each one consumes the oldest purchases in its window first.
 * - The loss is integrated, in the proportion sold, when those shares are transferred (FIFO)
 *   "for good" («de forma definitiva»): if that sale in turn has a repurchase in its window
 *   (whether at a gain or a loss), the proportional part stays deferred and moves to the new
 *   shares.
 *
 * Derivatives are subject to the rule too: the imported ones are warrants and certificates, which
 * are transferable securities (DGT V1790-07); V2172-21 only excludes contracts such as options
 * and futures. See ./README.md.
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

    // The order of the steps matters: what is released (1) is computed before the sale consumes
    // its window's capacity with its own loss (2), which takes priority over deferring the
    // released amount again (3).
    const { released, releasedQuantity } = releaseBlockedLosses(sale, states, aliveAfter);
    const capacity = collectWindowCandidates(sale, purchases, orderOf, aliveAfter, states);
    deferOwnLoss(sale, capacity, entry);
    integrateReleased(released, releasedQuantity, capacity, entry);
  }

  return result;
}
