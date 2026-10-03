// Capital gains and losses (ganancias y pérdidas patrimoniales) from transfers of homogeneous
// securities: FIFO lot matching. Pure core module. The savings tax lives in `savings-tax.ts`.
// Used by the sale simulation and the `realised-gains.ts` report, with the same rules.
// Tax scope (what it models and what it does not): see ./README.md. Indicative result only.

import { firstItem } from "../arrays.js";
import { finiteOr, QUANTITY_EPSILON } from "../inputs.js";
import type { PositionLot } from "../portfolio/types.js";
import { compareStrings } from "../compare.js";

/**
 * A transaction in a position's history, as served by `GET /api/positions/:id/lots`, in the
 * position's currency: a `PositionLot` without what FIFO does not use. `createdAt` is optional
 * because a simulation or a test may not have it.
 */
export type TradeLot = Pick<PositionLot, "id" | "kind" | "quantity" | "price" | "fees" | "tradedAt"> &
  Partial<Pick<PositionLot, "createdAt">>;

/** A purchase lot with its still unsold part. */
export interface OpenLot {
  lotId: string;
  tradedAt: string;
  /** The lot's remaining units. */
  quantity: number;
  /** Unit purchase price. */
  price: number;
  /** Purchase fees per unit (consistent proration if the lot is sold in several goes). */
  feesPerUnit: number;
}

/** A piece of a lot consumed by a sale, with its gain. */
export interface MatchedLot {
  lotId: string;
  tradedAt: string;
  /** Units of this lot the sale absorbs. */
  quantity: number;
  price: number;
  /** Acquisition value of that part (cost + prorated purchase fees). */
  acquisitionValue: number;
  /** Transfer value allocated to that part (proportional to the units). */
  transferValue: number;
  /** Gain (+) or loss (−) of that part. */
  gain: number;
}

/** Result of simulating a sale against the lot history. */
export interface SaleSimulation {
  /** Units held before the simulated sale. */
  availableQuantity: number;
  /** `true` if more units are requested than are held; amounts use only what is available and the UI must warn. */
  insufficient: boolean;
  /** Units actually matched (= requested `quantity`, unless `insufficient`). */
  quantitySold: number;
  /** Gross sale proceeds (units × price), before fees. */
  grossProceeds: number;
  /** Sale fees. */
  sellFees: number;
  /** Transfer value = gross − sale fees. */
  transferValue: number;
  /** Acquisition value of what was sold, purchase fees included. */
  acquisitionValue: number;
  /** Capital gain (+) or loss (−): transfer − acquisition. */
  gain: number;
  /** Breakdown per consumed lot, from oldest to newest. */
  matched: MatchedLot[];
  /** Units that would remain after the sale. */
  remainingQuantity: number;
  /** Average cost price of what would remain (excluding fees), or 0 if nothing remains. */
  remainingAvgPrice: number;
}

/**
 * Canonical order `(tradedAt, createdAt, id)`, the same as the backend (`lot-aggregate.ts`).
 * `tradedAt` has no time: without a tie-break, same-day FIFO would not be deterministic.
 */
export function compareTradeLots(a: TradeLot, b: TradeLot): number {
  if (a.tradedAt !== b.tradedAt) return compareStrings(a.tradedAt, b.tradedAt);
  const ca = a.createdAt ?? "";
  const cb = b.createdAt ?? "";
  if (ca !== cb) return compareStrings(ca, cb);
  return compareStrings(a.id, b.id);
}

/** A recorded sale, FIFO-matched against earlier purchases. */
export interface RealisedSale {
  /** Id of the sale lot. */
  lotId: string;
  /** Sale date (`YYYY-MM-DD`). */
  tradedAt: string;
  /** Matched units (those of the sale, unless it exceeds what is available). */
  quantity: number;
  /** Unit sale price. */
  price: number;
  grossProceeds: number;
  sellFees: number;
  transferValue: number;
  acquisitionValue: number;
  gain: number;
  matched: MatchedLot[];
}

/** Result of walking the history: what is still held and the sales already realised. */
export interface LotWalk {
  /** Purchase lots with their still unsold part, in chronological order. */
  open: OpenLot[];
  /** Recorded sales, in chronological order, with their gain or loss. */
  sales: RealisedSale[];
  /**
   * Ids of the purchases treated as a bonus issue and spread across the open lots (they are
   * neither a lot of their own nor a purchase for the two-month rule).
   */
  bonusIssueIds: string[];
  /**
   * Only with `trackOpenLots`: open lots right after each sale (key: the sale's id), with the
   * units at that moment. Not part of the serialisable result.
   */
  openAfterSale?: ReadonlyMap<string, readonly { lotId: string; quantity: number }[]>;
}

/** Options for `walkLots`. */
export interface WalkLotsOptions {
  /** Stores the open lots after each sale in `openAfterSale` (needed by `wash-sale.ts`). */
  trackOpenLots?: boolean;
}

/** Amounts of a sale matched against `open` (which is consumed in the process). */
type SaleMatch = Omit<RealisedSale, "lotId" | "tradedAt" | "price">;

/**
 * Matches a sale against the open lots by FIFO, consuming them (mutates `open`). It is the
 * single implementation: simulation and recorded sales give the same figure. The transfer value
 * is split in proportion to the units, so the per-lot gains add up exactly to the total. If the
 * sale exceeds what is available, it matches only what there is.
 */
function matchSale(open: OpenLot[], quantity: number, price: number, sellFees: number): SaleMatch {
  const available = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const quantitySold = Math.min(quantity, available);
  const grossProceeds = quantitySold * price;
  // The whole sale fee (it belongs to the transaction); with no holdings there is no transfer to charge it to.
  const fees = quantitySold > 0 ? sellFees : 0;
  const transferValue = grossProceeds - fees;

  const matched: MatchedLot[] = [];
  let pending = quantitySold;
  let acquisitionValue = 0;

  while (pending > QUANTITY_EPSILON && open.length > 0) {
    const lot = firstItem(open);
    const taken = Math.min(lot.quantity, pending);
    const lotAcquisition = taken * (lot.price + lot.feesPerUnit);
    const lotTransfer = quantitySold > 0 ? (transferValue * taken) / quantitySold : 0;

    matched.push({
      lotId: lot.lotId,
      tradedAt: lot.tradedAt,
      quantity: taken,
      price: lot.price,
      acquisitionValue: lotAcquisition,
      transferValue: lotTransfer,
      gain: lotTransfer - lotAcquisition,
    });

    acquisitionValue += lotAcquisition;
    pending -= taken;
    lot.quantity -= taken;
    // With a tolerance: subtracting decimals leaves 1e-16 leftovers that would clutter the breakdown.
    if (lot.quantity <= QUANTITY_EPSILON) open.shift();
  }

  return {
    quantity: quantitySold,
    grossProceeds,
    sellFees: fees,
    transferValue,
    acquisitionValue,
    gain: transferValue - acquisitionValue,
    matched,
  };
}

/** Sanitised fees: non-finite or negative ones count as 0. */
const cleanFees = (fees: number) => (Number.isFinite(fees) && fees > 0 ? fees : 0);

/**
 * Bonus issue (ampliación liberada, art. 37.1.a LIRPF): the new shares share the cost of the old
 * ones and inherit their holding period. Spreads `quantity` across the open lots in proportion to
 * their units: each lot gains shares and keeps its total cost (price and fees per unit drop in the
 * same proportion) and its date, and therefore its FIFO order.
 */
function applyBonusIssue(open: OpenLot[], quantity: number): void {
  const total = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const factor = (total + quantity) / total;
  for (const lot of open) {
    lot.quantity *= factor;
    lot.price /= factor;
    lot.feesPerUnit /= factor;
  }
}

/**
 * Walks the history in canonical order applying the sales by FIFO; returns the open lots and
 * the sales with their gain. A sale that exceeds what is available (the backend rejects it)
 * exhausts the holdings and the excess is ignored, so as not to leave negative quantities.
 *
 * **Bonus issues.** A purchase at price 0 and with no fees is read as fully paid-up bonus shares
 * (the importer converts `BONUS_ISSUE` this way) and spread across the open lots
 * (`applyBonusIssue`), with the holding period of the old ones. Partly paid-up bonus shares
 * (something is paid) are not told apart from an ordinary purchase and stay a purchase. With no
 * open lots, it is a purchase at price 0. It also affects `simulateSale` and `buildOpenLots`.
 */
export function walkLots(lots: readonly TradeLot[], options: WalkLotsOptions = {}): LotWalk {
  const ordered = [...lots].sort(compareTradeLots);
  const open: OpenLot[] = [];
  const sales: RealisedSale[] = [];
  const bonusIssueIds: string[] = [];
  const openAfterSale = options.trackOpenLots ? new Map<string, { lotId: string; quantity: number }[]>() : undefined;

  for (const lot of ordered) {
    if (!Number.isFinite(lot.quantity) || lot.quantity <= 0) continue;
    const price = finiteOr(lot.price, 0);

    if (lot.kind === "buy") {
      // Bonus issue: a GENUINE price of 0 (not a non-numeric price sanitised to 0), no fees and
      // open lots. See README, "Bonus issues".
      const isBonusIssue =
        lot.price === 0 && cleanFees(lot.fees) === 0 && open.some((l) => l.quantity > QUANTITY_EPSILON);
      if (isBonusIssue) {
        applyBonusIssue(open, lot.quantity);
        bonusIssueIds.push(lot.id);
        continue;
      }
      open.push({
        lotId: lot.id,
        tradedAt: lot.tradedAt,
        quantity: lot.quantity,
        price,
        feesPerUnit: cleanFees(lot.fees) / lot.quantity,
      });
      continue;
    }

    const match = matchSale(open, lot.quantity, price, cleanFees(lot.fees));
    sales.push({ lotId: lot.id, tradedAt: lot.tradedAt, price, ...match });
    openAfterSale?.set(
      lot.id,
      open.map((l) => ({ lotId: l.lotId, quantity: l.quantity })),
    );
  }

  return { open, sales, bonusIssueIds, ...(openAfterSale ? { openAfterSale } : {}) };
}

/** Open purchase lots after applying the recorded sales (see `walkLots`). */
export function buildOpenLots(lots: readonly TradeLot[]): OpenLot[] {
  return walkLots(lots).open;
}

/** Simulation input: the position's history and the hypothetical sale. */
export interface SaleSimulationInput {
  /** The position's full history (purchases and sales), in any order. */
  lots: readonly TradeLot[];
  /** Units to sell. */
  quantity: number;
  /** Unit sale price. */
  price: number;
  /** Sale fees. Defaults to 0. */
  fees?: number;
}

/**
 * Simulates a sale against the history by FIFO. Returns `null` if the input cannot be computed
 * (non-finite quantity or price, quantity ≤ 0, negative price): better no result than a made-up
 * number.
 */
export function simulateSale({ lots, quantity, price, fees = 0 }: SaleSimulationInput): SaleSimulation | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  const sellFees = cleanFees(fees);

  const open = buildOpenLots(lots);
  const availableQuantity = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const insufficient = quantity > availableQuantity + QUANTITY_EPSILON;
  const sale = matchSale(open, quantity, price, sellFees);

  // `open` is already consumed: it is the position after the sale.
  const remainingQuantity = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const remainingCost = open.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);

  return {
    availableQuantity,
    insufficient,
    quantitySold: sale.quantity,
    grossProceeds: sale.grossProceeds,
    sellFees: sale.sellFees,
    transferValue: sale.transferValue,
    acquisitionValue: sale.acquisitionValue,
    gain: sale.gain,
    matched: sale.matched,
    remainingQuantity,
    remainingAvgPrice: remainingQuantity > 0 ? remainingCost / remainingQuantity : 0,
  };
}
