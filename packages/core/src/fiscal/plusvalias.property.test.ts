import fc from "fast-check";
import { describe, it } from "vitest";

import { PROPERTY_PARAMS } from "../test-support/property-config.js";
import { walkLots, type TradeLot } from "./plusvalias.js";

/** Arbitrary history: buys and sells dated 2020-2025, in any order. */
const history = fc
  .array(
    fc.record({
      kind: fc.constantFrom("buy" as const, "sell" as const),
      quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
      price: fc.double({ min: 0, max: 1000, noNaN: true }),
      fees: fc.double({ min: 0, max: 20, noNaN: true }),
      day: fc.integer({ min: 0, max: 6 * 365 }),
    }),
    { maxLength: 30 },
  )
  .map((rows) =>
    rows.map((row, i): TradeLot => ({
      id: `lot-${String(i).padStart(3, "0")}`,
      kind: row.kind,
      quantity: row.quantity,
      price: row.price,
      fees: row.fees,
      tradedAt: new Date(Date.UTC(2020, 0, 1) + row.day * 86_400_000).toISOString().slice(0, 10),
    })),
  );

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

describe("walkLots — properties", () => {
  it("conserves quantity: bought = matched sold + what remains open", () => {
    fc.assert(
      fc.property(history, (lots) => {
        const { open, sales } = walkLots(lots);
        const bought = lots.filter((l) => l.kind === "buy").reduce((s, l) => s + l.quantity, 0);
        const sold = sales.reduce((s, sale) => s + sale.quantity, 0);
        const alive = open.reduce((s, lot) => s + lot.quantity, 0);
        return close(bought, sold + alive);
      }),
      PROPERTY_PARAMS,
    );
  });

  it("has no realised gains without sales", () => {
    fc.assert(
      fc.property(history, (lots) => walkLots(lots.filter((l) => l.kind === "buy")).sales.length === 0),
      PROPERTY_PARAMS,
    );
  });

  it("every sale reconciles: gain = transfer − acquisition = sum of the per-lot breakdown", () => {
    fc.assert(
      fc.property(history, (lots) =>
        walkLots(lots).sales.every(
          (sale) =>
            close(sale.gain, sale.transferValue - sale.acquisitionValue) &&
            close(
              sale.gain,
              sale.matched.reduce((s, m) => s + m.gain, 0),
            ) &&
            close(
              sale.quantity,
              sale.matched.reduce((s, m) => s + m.quantity, 0),
            ),
        ),
      ),
      PROPERTY_PARAMS,
    );
  });

  it("the result does not depend on the order in which the lots arrive", () => {
    fc.assert(
      fc.property(history, (lots) => {
        const forward = walkLots(lots);
        const backward = walkLots([...lots].reverse());
        return JSON.stringify(forward) === JSON.stringify(backward);
      }),
      PROPERTY_PARAMS,
    );
  });
});
