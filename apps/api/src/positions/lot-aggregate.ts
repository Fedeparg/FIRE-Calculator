// Pure aggregation of lots → (quantity, average price). `numeric` values arrive as `string` and
// are handled as fixed-point integers (`bigint`): going through `number` would shift the average
// price by cents due to binary rounding error.

import { compareStrings } from '@sextante/core/compare';
import { DomainError } from '../common/domain-error.js';
import type { PositionLotKind } from '../db/schema.js';

/** Scale (decimal places) of `position_lots.quantity/price` and `positions.quantity/avg_price`. */
export const AMOUNT_SCALE = 6;

/** Scale of the accumulated cost (quantity · price = exactly 12 decimals). Only sells round, half-up: max error 5·10⁻¹³. */
export const COST_SCALE = 12;

/** A lot as the aggregation needs it (a subset of `PositionLot`). */
export interface AggregatableLot {
  id: string;
  kind: PositionLotKind;
  /** Decimal as a `string`, exactly as Drizzle returns it. */
  quantity: string;
  price: string;
  /** Trade date (YYYY-MM-DD). */
  tradedAt: string;
  /** Creation instant; breaks ties between lots on the same day. */
  createdAt: Date;
}

/** Aggregation result: the two fields `positions` keeps in sync. */
export interface LotAggregate {
  quantity: string;
  avgPrice: string;
  /** Open cost (quantity · average price); informational, with no column of its own. */
  cost: string;
}

/** Aggregation error codes (the edge translates them to 400; see `DomainError`). */
export type LotAggregateErrorCode = 'NEGATIVE_QUANTITY' | 'OVERFLOW' | 'INVALID_DECIMAL';

export class LotAggregateError extends DomainError {
  constructor(
    readonly code: LotAggregateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LotAggregateError';
  }
}

/** Upper bound of `numeric(18,6)` (12 integer digits): a clear 400 instead of a driver 500. */
const MAX_AMOUNT_UNITS = 10n ** 12n;

const ONE_AMOUNT = 10n ** BigInt(AMOUNT_SCALE);

/** Selling "everything" can exceed what was bought due to rounding to 6 decimals (a broker exports up to 10): within 10⁻⁶ it becomes 0; beyond that it is an oversell (no shorts) and fails. */
const SELL_ROUNDING_TOLERANCE = 1n;

/** Only "plain" decimals with an optional sign: no exponential notation or whitespace. */
const PLAIN_DECIMAL = /^[+-]?(\d+)(?:\.(\d+))?$/;

/** Decimal `string` → fixed-point integer with `scale` decimals (half-up if it has more). */
export function parseDecimal(value: string, scale: number): bigint {
  const match = PLAIN_DECIMAL.exec(value.trim());
  if (!match) {
    throw new LotAggregateError('INVALID_DECIMAL', `Valor decimal no válido: "${value}"`);
  }
  const negative = value.trim().startsWith('-');
  const [, intPart, fracPart = ''] = match;

  // Pads with zeros or truncates (keeping the first extra digit for rounding).
  const padded = fracPart.padEnd(scale + 1, '0');
  const kept = padded.slice(0, scale);
  const nextDigit = padded.charCodeAt(scale) - 48;

  let units = BigInt(intPart + kept);
  if (nextDigit >= 5) units += 1n;
  return negative ? -units : units;
}

/** Inverse of `parseDecimal`. */
export function formatDecimal(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = scale > 0 ? `.${digits.slice(digits.length - scale)}` : '';
  return `${negative ? '-' : ''}${intPart}${fracPart}`;
}

/** Integer division with half-up rounding (`divisor` must be > 0). */
function divRoundHalfUp(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  if (absRemainder * 2n < divisor) return quotient;
  return dividend < 0n ? quotient - 1n : quotient + 1n;
}

/**
 * Canonical order `(tradedAt, createdAt, id)`. `tradedAt` has no time: without a tie-break, the
 * moving average cost would depend on the order in which the DB returns same-day rows.
 */
export function compareLots(a: AggregatableLot, b: AggregatableLot): number {
  if (a.tradedAt !== b.tradedAt) return compareStrings(a.tradedAt, b.tradedAt);
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta - tb;
  return compareStrings(a.id, b.id);
}

/**
 * Open quantity and average price by moving average cost: a buy adds `q` and `q · p`; a sell
 * subtracts `q` and `q · currentAveragePrice` (the average does not change). It is not the mean of
 * all buys: 10@100, sell 5, 5@200 → quantity 10, average 150 (not 133.33).
 *
 * @throws {LotAggregateError} `NEGATIVE_QUANTITY` (oversell, beyond tolerance) or
 *   `OVERFLOW` (does not fit in `numeric(18,6)`).
 */
export function aggregateLots(lots: readonly AggregatableLot[]): LotAggregate {
  const ordered = [...lots].sort(compareLots);

  // `quantity` at scale 6 (exact additions and subtractions); `cost` at scale 12 (see COST_SCALE).
  let quantity = 0n;
  let cost = 0n;

  for (const lot of ordered) {
    const q = parseDecimal(lot.quantity, AMOUNT_SCALE);
    const p = parseDecimal(lot.price, AMOUNT_SCALE);

    if (lot.kind === 'buy') {
      quantity += q;
      // scale 6 · scale 6 = scale 12: exact product, no rounding.
      cost += q * p;
      continue;
    }

    let remaining = quantity - q;
    if (remaining < 0n && -remaining <= SELL_ROUNDING_TOLERANCE) remaining = 0n;
    if (remaining < 0n) {
      throw new LotAggregateError(
        'NEGATIVE_QUANTITY',
        'La venta deja la posición en negativo: no puedes vender más de lo que tienes',
      );
    }
    // `cost · remaining / quantity` in a single division: rounds once, not twice.
    cost = remaining === 0n || quantity === 0n ? 0n : divRoundHalfUp(cost * remaining, quantity);
    quantity = remaining;
  }

  // avgPrice = cost / quantity. In units: (cost/10¹²) / (quantity/10⁶) · 10⁶ = cost/quantity.
  const avgPrice = quantity > 0n ? divRoundHalfUp(cost, quantity) : 0n;
  const costAmount = divRoundHalfUp(cost, 10n ** BigInt(COST_SCALE - AMOUNT_SCALE));

  // Only the two values that go into `numeric(18,6)`; the open cost has no column.
  for (const units of [quantity, avgPrice]) {
    if (units >= MAX_AMOUNT_UNITS * ONE_AMOUNT) {
      throw new LotAggregateError('OVERFLOW', 'El resultado de los lotes excede el máximo admitido por la posición');
    }
  }

  return {
    quantity: formatDecimal(quantity, AMOUNT_SCALE),
    avgPrice: formatDecimal(avgPrice, AMOUNT_SCALE),
    cost: formatDecimal(costAmount, AMOUNT_SCALE),
  };
}
