import { describe, expect, it } from "vitest";

import { buildOpenLots, simulateSale, walkLots, type TradeLot } from "./plusvalias.js";
import { estimateSavingsTax } from "./savings-tax.js";
import { firstItem, itemAt } from "../arrays.js";
import { defined } from "../assert.js";

/** Short lot builder: tests only set what they care about. */
function lot(overrides: Partial<TradeLot> & Pick<TradeLot, "id">): TradeLot {
  return {
    kind: "buy",
    quantity: 1,
    price: 100,
    fees: 0,
    tradedAt: "2024-01-01",
    ...overrides,
  };
}

describe("buildOpenLots", () => {
  it("returns the purchases untouched when there are no sales", () => {
    const open = buildOpenLots([
      lot({ id: "a", quantity: 10, price: 50, tradedAt: "2024-01-10" }),
      lot({ id: "b", quantity: 5, price: 80, tradedAt: "2024-03-01" }),
    ]);

    expect(open.map((o) => [o.lotId, o.quantity])).toEqual([
      ["a", 10],
      ["b", 5],
    ]);
  });

  it("sorts chronologically even when they arrive out of order", () => {
    const open = buildOpenLots([lot({ id: "b", tradedAt: "2024-03-01" }), lot({ id: "a", tradedAt: "2024-01-10" })]);

    expect(open.map((o) => o.lotId)).toEqual(["a", "b"]);
  });

  it("breaks ties between two same-day trades by createdAt and then by id", () => {
    const open = buildOpenLots([
      lot({ id: "z", tradedAt: "2024-01-10", createdAt: "2024-01-10T10:00:00.000Z" }),
      lot({ id: "a", tradedAt: "2024-01-10", createdAt: "2024-01-10T09:00:00.000Z" }),
    ]);

    expect(open.map((o) => o.lotId)).toEqual(["a", "z"]);
  });

  it("an earlier sale consumes the oldest lots first (FIFO)", () => {
    const open = buildOpenLots([
      lot({ id: "a", quantity: 10, price: 50, tradedAt: "2024-01-10" }),
      lot({ id: "b", quantity: 10, price: 80, tradedAt: "2024-02-10" }),
      lot({ id: "s", kind: "sell", quantity: 12, price: 90, tradedAt: "2024-03-10" }),
    ]);

    // "a" is fully used up and 8 of "b" remain.
    expect(open.map((o) => [o.lotId, o.quantity])).toEqual([["b", 8]]);
  });

  it("prorates purchase fees per unit", () => {
    const open = firstItem(buildOpenLots([lot({ id: "a", quantity: 4, price: 25, fees: 10 })]));
    expect(open.feesPerUnit).toBe(2.5);
  });

  it("ignores lots with an invalid quantity instead of poisoning the calculation", () => {
    const open = buildOpenLots([
      lot({ id: "bad", quantity: 0 }),
      lot({ id: "nan", quantity: Number.NaN }),
      lot({ id: "ok", quantity: 3 }),
    ]);

    expect(open.map((o) => o.lotId)).toEqual(["ok"]);
  });

  it("a sale exceeding the available quantity exhausts the holdings without leaving negative quantities", () => {
    const open = buildOpenLots([
      lot({ id: "a", quantity: 5 }),
      lot({ id: "s", kind: "sell", quantity: 50, tradedAt: "2024-06-01" }),
    ]);

    expect(open).toEqual([]);
  });
});

describe("simulateSale", () => {
  it("partial sale of a single lot", () => {
    const sim = simulateSale({
      lots: [lot({ id: "a", quantity: 10, price: 100 })],
      quantity: 4,
      price: 150,
    });

    expect(sim).not.toBeNull();
    expect(sim?.quantitySold).toBe(4);
    expect(sim?.grossProceeds).toBe(600);
    expect(sim?.acquisitionValue).toBe(400);
    expect(sim?.gain).toBe(200);
    expect(sim?.remainingQuantity).toBe(6);
    expect(sim?.remainingAvgPrice).toBe(100);
    expect(sim?.insufficient).toBe(false);
  });

  it("a full sale leaves the position at zero", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 10, price: 100 })],
        quantity: 10,
        price: 120,
      }),
    );

    expect(sim.quantitySold).toBe(10);
    expect(sim.gain).toBe(200);
    expect(sim.remainingQuantity).toBe(0);
    expect(sim.remainingAvgPrice).toBe(0);
  });

  it("consumes several lots by FIFO and recomputes the average price of what remains", () => {
    const sim = defined(
      simulateSale({
        lots: [
          lot({ id: "a", quantity: 10, price: 100, tradedAt: "2024-01-01" }),
          lot({ id: "b", quantity: 10, price: 200, tradedAt: "2024-02-01" }),
        ],
        quantity: 15,
        price: 250,
      }),
    );

    // FIFO: 10 of "a" at 100 + 5 of "b" at 200 = 2,000 of cost.
    expect(sim.acquisitionValue).toBe(2000);
    expect(sim.grossProceeds).toBe(3750);
    expect(sim.gain).toBe(1750);
    expect(sim.matched.map((m) => [m.lotId, m.quantity])).toEqual([
      ["a", 10],
      ["b", 5],
    ]);
    // Only 5 units of the expensive lot remain.
    expect(sim.remainingQuantity).toBe(5);
    expect(sim.remainingAvgPrice).toBe(200);
  });

  it("the per-lot breakdown adds up exactly to the total gain", () => {
    const sim = defined(
      simulateSale({
        lots: [
          lot({ id: "a", quantity: 3, price: 33.33, tradedAt: "2024-01-01" }),
          lot({ id: "b", quantity: 4, price: 41.17, tradedAt: "2024-02-01" }),
        ],
        quantity: 6,
        price: 77.77,
        fees: 3.21,
      }),
    );

    const sum = sim.matched.reduce((acc, m) => acc + m.gain, 0);
    expect(sum).toBeCloseTo(sim.gain, 10);
  });

  it("a sale below the purchase price yields a loss", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 10, price: 100 })],
        quantity: 10,
        price: 60,
      }),
    );

    expect(sim.gain).toBe(-400);
    expect(estimateSavingsTax(sim.gain).tax).toBe(0);
  });

  it("purchase fees raise the cost and sale fees lower the proceeds", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 10, price: 100, fees: 20 })],
        quantity: 10,
        price: 150,
        fees: 30,
      }),
    );

    // Acquisition 1,000 + 20; transfer 1,500 − 30 → gain 450 (not 500).
    expect(sim.acquisitionValue).toBe(1020);
    expect(sim.transferValue).toBe(1470);
    expect(sim.gain).toBe(450);
  });

  it("prorates purchase fees in a partial sale", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 10, price: 100, fees: 20 })],
        quantity: 4,
        price: 100,
      }),
    );

    // Only 4/10 of the purchase fee goes into the cost → a loss of 8.
    expect(sim.acquisitionValue).toBeCloseTo(408, 10);
    expect(sim.gain).toBeCloseTo(-8, 10);
  });

  it("supports fractional quantities (crypto, funds)", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 0.5, price: 20000 })],
        quantity: 0.125,
        price: 40000,
      }),
    );

    expect(sim.grossProceeds).toBeCloseTo(5000, 10);
    expect(sim.acquisitionValue).toBeCloseTo(2500, 10);
    expect(sim.gain).toBeCloseTo(2500, 10);
    expect(sim.remainingQuantity).toBeCloseTo(0.375, 10);
  });

  it("takes into account the sales already recorded in the history", () => {
    const sim = defined(
      simulateSale({
        lots: [
          lot({ id: "a", quantity: 10, price: 100, tradedAt: "2024-01-01" }),
          lot({ id: "b", quantity: 10, price: 200, tradedAt: "2024-02-01" }),
          lot({ id: "s", kind: "sell", quantity: 10, price: 150, tradedAt: "2024-03-01" }),
        ],
        quantity: 5,
        price: 300,
      }),
    );

    // The earlier sale used up lot "a": what is sold now comes from "b" at 200.
    expect(sim.availableQuantity).toBe(10);
    expect(sim.acquisitionValue).toBe(1000);
    expect(sim.gain).toBe(500);
    expect(sim.matched.map((m) => m.lotId)).toEqual(["b"]);
  });

  it("flags insufficient when asked to sell more units than are held", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 3, price: 100 })],
        quantity: 10,
        price: 120,
      }),
    );

    expect(sim.insufficient).toBe(true);
    expect(sim.availableQuantity).toBe(3);
    expect(sim.quantitySold).toBe(3);
  });

  it("has nothing to sell without open lots", () => {
    const sim = defined(simulateSale({ lots: [], quantity: 1, price: 100 }));

    expect(sim.availableQuantity).toBe(0);
    expect(sim.quantitySold).toBe(0);
    expect(sim.insufficient).toBe(true);
    expect(sim.matched).toEqual([]);
    expect(sim.gain).toBe(0);
  });

  it("a sale at zero price is valid and yields a loss equal to the cost", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 2, price: 50 })],
        quantity: 2,
        price: 0,
      }),
    );

    expect(sim.gain).toBe(-100);
  });

  it("returns null when the input does not allow computing anything", () => {
    const lots = [lot({ id: "a", quantity: 10, price: 100 })];
    expect(simulateSale({ lots, quantity: 0, price: 100 })).toBeNull();
    expect(simulateSale({ lots, quantity: -1, price: 100 })).toBeNull();
    expect(simulateSale({ lots, quantity: Number.NaN, price: 100 })).toBeNull();
    expect(simulateSale({ lots, quantity: 1, price: -5 })).toBeNull();
    expect(simulateSale({ lots, quantity: 1, price: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe("walkLots", () => {
  it("has no realised gains without sales", () => {
    const { sales, open } = walkLots([lot({ id: "a", quantity: 10 })]);
    expect(sales).toEqual([]);
    expect(open).toHaveLength(1);
  });

  it("realises the gain of a partial sale by FIFO, with purchase and sale fees", () => {
    const { sales, open } = walkLots([
      lot({ id: "a", quantity: 10, price: 50, fees: 10, tradedAt: "2024-01-10" }),
      lot({ id: "b", quantity: 10, price: 80, tradedAt: "2024-02-10" }),
      lot({ id: "s", kind: "sell", quantity: 4, price: 100, fees: 4, tradedAt: "2024-06-01" }),
    ]);

    expect(sales).toHaveLength(1);
    const sale = firstItem(sales);
    expect(sale.lotId).toBe("s");
    expect(sale.tradedAt).toBe("2024-06-01");
    expect(sale.quantity).toBe(4);
    // Transfer 400 − 4; acquisition 4 × (50 + 1 of prorated fee).
    expect(sale.transferValue).toBe(396);
    expect(sale.acquisitionValue).toBeCloseTo(204, 10);
    expect(sale.gain).toBeCloseTo(192, 10);
    expect(open.map((o) => [o.lotId, o.quantity])).toEqual([
      ["a", 6],
      ["b", 10],
    ]);
  });

  it("a sale spanning lots breaks down each one and reconciles with the total", () => {
    const { sales } = walkLots([
      lot({ id: "a", quantity: 3, price: 10, tradedAt: "2024-01-01" }),
      lot({ id: "b", quantity: 3, price: 20, tradedAt: "2024-01-02" }),
      lot({ id: "s", kind: "sell", quantity: 5, price: 15, tradedAt: "2024-03-01" }),
    ]);

    const sale = firstItem(sales);
    expect(sale.matched.map((m) => [m.lotId, m.quantity])).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
    const sum = sale.matched.reduce((acc, m) => acc + m.gain, 0);
    expect(sum).toBeCloseTo(sale.gain, 10);
    expect(sale.gain).toBeCloseTo(75 - 30 - 40, 10);
  });

  it("chains several sales: the second matches what the first left", () => {
    const { sales } = walkLots([
      lot({ id: "a", quantity: 5, price: 10, tradedAt: "2023-01-01" }),
      lot({ id: "b", quantity: 5, price: 30, tradedAt: "2023-06-01" }),
      lot({ id: "s1", kind: "sell", quantity: 5, price: 20, tradedAt: "2023-12-01" }),
      lot({ id: "s2", kind: "sell", quantity: 5, price: 20, tradedAt: "2024-02-01" }),
    ]);

    expect(sales.map((s) => [s.lotId, s.gain])).toEqual([
      ["s1", 50],
      ["s2", -50],
    ]);
  });

  it("breaks same-day ties by creation date, like the backend", () => {
    const { sales } = walkLots([
      lot({
        id: "s",
        kind: "sell",
        quantity: 1,
        price: 150,
        tradedAt: "2024-05-05",
        createdAt: "2024-05-05T10:00:00Z",
      }),
      lot({ id: "a", quantity: 1, price: 100, tradedAt: "2024-05-05", createdAt: "2024-05-05T09:00:00Z" }),
    ]);

    expect(sales).toHaveLength(1);
    expect(itemAt(sales, 0).gain).toBe(50);
  });

  it("a sale exceeding the available quantity only matches what is held", () => {
    const { sales, open } = walkLots([
      lot({ id: "a", quantity: 2, price: 10 }),
      lot({ id: "s", kind: "sell", quantity: 5, price: 20, tradedAt: "2024-02-01" }),
    ]);

    expect(itemAt(sales, 0).quantity).toBe(2);
    expect(itemAt(sales, 0).gain).toBe(20);
    expect(open).toEqual([]);
  });

  it("matches simulating the same sale on the prior history", () => {
    const history = [
      lot({ id: "a", quantity: 7, price: 12, fees: 3, tradedAt: "2024-01-01" }),
      lot({ id: "b", quantity: 4, price: 18, fees: 1, tradedAt: "2024-02-01" }),
    ];
    const simulated = simulateSale({ lots: history, quantity: 9, price: 25, fees: 2 });
    const { sales } = walkLots([
      ...history,
      lot({ id: "s", kind: "sell", quantity: 9, price: 25, fees: 2, tradedAt: "2024-03-01" }),
    ]);

    expect(itemAt(sales, 0).gain).toBe(simulated?.gain);
    expect(itemAt(sales, 0).matched).toEqual(simulated?.matched);
  });

  it("a sale with no holdings does not book its fees as a loss", () => {
    // Counterexample found by the property test: with no purchases to match, the
    // fee does not belong to any unit sold.
    const { sales } = walkLots([lot({ id: "s", kind: "sell", quantity: 1, price: 10, fees: 2 })]);
    expect(sales[0]).toMatchObject({ quantity: 0, sellFees: 0, transferValue: 0, gain: 0 });
  });
});

describe("bonus issues (ampliaciones liberadas, art. 37.1.a LIRPF)", () => {
  // Example from the Manual práctico de Renta 2025 (Part 1, pp. 885-887).
  const manualHistory: TradeLot[] = [
    lot({ id: "buy-2001", quantity: 900, price: 10, tradedAt: "2001-03-05" }),
    lot({ id: "bonus-2007", quantity: 600, price: 0, tradedAt: "2007-05-11" }),
    // Partially paid-up: €5/share is paid, so they count as a regular purchase.
    lot({ id: "buy-2011", quantity: 500, price: 5, tradedAt: "2011-09-14" }),
  ];

  it("reproduces the Manual de Renta 2025 example: 6,000 + 500 = €6,500", () => {
    const sim = simulateSale({ lots: manualHistory, quantity: 1600, price: 10 });

    expect(sim?.gain).toBeCloseTo(6500, 6);
    expect(sim?.matched.map((m) => [m.lotId, m.tradedAt, Math.round(m.quantity), Math.round(m.gain)])).toEqual([
      ["buy-2001", "2001-03-05", 1500, 6000],
      ["buy-2011", "2011-09-14", 100, 500],
    ]);
    expect(sim?.matched[0]?.price).toBeCloseTo(6, 9);
  });

  it("the bonus issue does not create its own lot: it keeps the total cost and the date", () => {
    const walk = walkLots(manualHistory);

    expect(walk.bonusIssueIds).toEqual(["bonus-2007"]);
    expect(walk.open.map((o) => o.lotId)).toEqual(["buy-2001", "buy-2011"]);
    expect(itemAt(walk.open, 0).quantity).toBeCloseTo(1500, 9);
    expect(itemAt(walk.open, 0).quantity * itemAt(walk.open, 0).price).toBeCloseTo(9000, 6);
  });

  it("spreads proportionally across several open lots and respects what was already sold", () => {
    const open = buildOpenLots([
      lot({ id: "a", quantity: 100, price: 10, fees: 10, tradedAt: "2020-01-01" }),
      lot({ id: "b", quantity: 100, price: 20, tradedAt: "2020-02-01" }),
      lot({ id: "s", kind: "sell", quantity: 50, price: 15, tradedAt: "2020-03-01" }),
      lot({ id: "bonus", quantity: 75, price: 0, tradedAt: "2020-04-01" }),
    ]);

    // Open before: a=50, b=100 (total 150) → factor 1.5.
    expect(open.map((o) => [o.lotId, o.quantity])).toEqual([
      ["a", 75],
      ["b", 150],
    ]);
    expect(itemAt(open, 0).quantity * (itemAt(open, 0).price + itemAt(open, 0).feesPerUnit)).toBeCloseTo(
      50 * (10 + 0.1),
      6,
    );
    expect(itemAt(open, 1).quantity * itemAt(open, 1).price).toBeCloseTo(2000, 6);
  });

  it("a zero-price purchase with fees, or with no open lots, is still a regular purchase", () => {
    expect(buildOpenLots([lot({ id: "a", price: 10 }), lot({ id: "x", price: 0, fees: 1 })])).toHaveLength(2);
    expect(buildOpenLots([lot({ id: "x", quantity: 5, price: 0 })])).toHaveLength(1);
  });

  it("a non-numeric price is not a bonus issue: it stays as its own purchase (at zero cost) and is not spread", () => {
    for (const price of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const walk = walkLots([lot({ id: "a", quantity: 10, price: 10 }), lot({ id: "x", quantity: 5, price })]);

      expect(walk.bonusIssueIds).toEqual([]);
      expect(walk.open.map((o) => [o.lotId, o.quantity, o.price])).toEqual([
        ["a", 10, 10],
        ["x", 5, 0],
      ]);
    }
  });
});
