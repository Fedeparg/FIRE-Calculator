import { describe, expect, it } from "vitest";

import type { TradeLot } from "./plusvalias.js";
import { estimateSavingsTax } from "./savings-tax.js";
import type { ReferenceRates } from "./fx-reference.js";
import { buildRealisedGainsReport, referenceRatesNeeded, type RealisedGainsPosition } from "./realised-gains.js";
import { firstItem, itemAt, takeItems } from "../arrays.js";

function lot(overrides: Partial<TradeLot> & Pick<TradeLot, "id">): TradeLot {
  return { kind: "buy", quantity: 1, price: 100, fees: 0, tradedAt: "2024-01-01", ...overrides };
}

function position(
  overrides: Partial<RealisedGainsPosition> & Pick<RealisedGainsPosition, "id" | "lots">,
): RealisedGainsPosition {
  return { ticker: overrides.id.toUpperCase(), name: null, currency: "EUR", ...overrides };
}

const buy = (id: string, quantity: number, price: number, tradedAt: string) => lot({ id, quantity, price, tradedAt });
const sell = (id: string, quantity: number, price: number, tradedAt: string) =>
  lot({ id, kind: "sell", quantity, price, tradedAt });

/** Report without reference rates: enough for everything in euros. */
const build = (positions: RealisedGainsPosition[], rates: ReferenceRates = {}) =>
  buildRealisedGainsReport(positions, rates);

/** 1 EUR = `unitsPerEur` USD on each given date. */
const usd = (points: Record<string, number>): ReferenceRates => ({
  USD: Object.entries(points)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, unitsPerEur]) => ({ date, unitsPerEur })),
});

describe("buildRealisedGainsReport", () => {
  it("without sales, the report is empty", () => {
    expect(build([position({ id: "a", lots: [buy("1", 10, 5, "2024-01-01")] })]).years).toEqual([]);
    expect(build([]).years).toEqual([]);
  });

  it("groups by tax year, newest first", () => {
    const report = build([
      position({
        id: "a",
        lots: [buy("1", 10, 10, "2022-01-01"), sell("2", 2, 15, "2023-05-01"), sell("3", 2, 20, "2025-03-01")],
      }),
    ]);

    expect(report.years.map((y) => y.year)).toEqual([2025, 2023]);
    expect(itemAt(report.years, 0).net).toBe(20);
    expect(itemAt(report.years, 1).net).toBe(10);
  });

  it("offsets gains and losses within the same tax year and estimates the tax on the net balance", () => {
    const report = build([
      position({ id: "win", lots: [buy("1", 10, 10, "2024-01-01"), sell("2", 10, 20, "2024-06-01")] }),
      position({ id: "lose", lots: [buy("3", 10, 10, "2024-01-01"), sell("4", 10, 7, "2024-07-01")] }),
    ]);

    const year = firstItem(report.years);
    expect(year.gains).toBe(100);
    expect(year.losses).toBe(-30);
    expect(year.net).toBe(70);
    expect(year.tax).toEqual(estimateSavingsTax(70));
    expect(year.rows.map((r) => [r.ticker, r.gain])).toEqual([
      ["LOSE", -30],
      ["WIN", 100],
    ]);
  });

  it("a tax year with a net loss yields zero tax (not carried forward)", () => {
    const report = build([
      position({ id: "a", lots: [buy("1", 10, 10, "2024-01-01"), sell("2", 10, 5, "2024-06-01")] }),
    ]);

    expect(itemAt(report.years, 0).net).toBe(-50);
    expect(itemAt(report.years, 0).tax?.tax).toBe(0);
  });

  it("leaves out of the totals foreign-currency sales with no rate for the sale date", () => {
    const report = build([
      position({ id: "usd", currency: "USD", lots: [buy("1", 1, 100, "2024-01-01"), sell("2", 1, 300, "2024-02-01")] }),
      position({ id: "eur", lots: [buy("3", 1, 100, "2024-01-01"), sell("4", 1, 110, "2024-02-01")] }),
      position({ id: "gbp", currency: "GBP", lots: [buy("5", 1, 100, "2024-01-01"), sell("6", 1, 90, "2024-02-01")] }),
    ]);

    const year = firstItem(report.years);
    expect(year.net).toBe(10);
    expect(year.unconverted).toEqual([
      { currency: "GBP", sales: 1, gain: -10 },
      { currency: "USD", sales: 1, gain: 200 },
    ]);
    expect(year.sales.filter((s) => s.eur === null).map((s) => s.positionId)).toEqual(["gbp", "usd"]);
    expect(year.tax).toEqual(estimateSavingsTax(10));
  });

  it("computes the gain in the foreign currency and converts it at the sale-date rate (DGT criterion)", () => {
    // Example from the plan: 10 shares bought for USD 1,500 + USD 1 fee at 1 EUR = 1.07 USD
    // and sold for USD 2,100 − USD 1 at 1 EUR = 1.0885 USD.
    const report = build(
      [
        position({
          id: "aapl",
          currency: "USD",
          lots: [
            lot({ id: "1", quantity: 10, price: 150, fees: 1, tradedAt: "2023-10-03" }),
            lot({ id: "2", kind: "sell", quantity: 10, price: 210, fees: 1, tradedAt: "2025-03-14" }),
          ],
        }),
      ],
      usd({ "2023-10-03": 1.07, "2025-03-14": 1.0885 }),
    );

    const year = firstItem(report.years);
    const sale = firstItem(year.sales);
    // Gain in USD: 2,099 − 1,501 = 598, at 1.0885.
    expect(sale.gain).toBeCloseTo(598, 9);
    expect(sale.eur?.gain).toBeCloseTo(598 / 1.0885, 9);
    expect(sale.eur?.transferValue).toBeCloseTo(2099 / 1.0885, 9);
    expect(sale.eur?.acquisitionValue).toBeCloseTo(1501 / 1.0885, 9);
    // FX difference on the USD 1,501 invested: they are worth fewer euros at the sale.
    expect(sale.eur?.fxDifference).toBeCloseTo(1501 / 1.0885 - 1501 / 1.07, 9);
    expect(sale.eur?.sellRate).toEqual({ currency: "USD", unitsPerEur: 1.0885, date: "2025-03-14" });
    expect(sale.eur?.buyRates).toEqual([{ currency: "USD", unitsPerEur: 1.07, date: "2023-10-03" }]);
    // Together they add up to the same as converting each trade at its own date.
    expect(year.total).toBeCloseTo(2099 / 1.0885 - 1501 / 1.07, 9);
    expect(year.tax).toEqual(estimateSavingsTax(year.total));
  });

  it("without the rate for some purchase, converts the gain but not the FX difference", () => {
    const report = build(
      [
        position({
          id: "usd",
          currency: "USD",
          lots: [buy("1", 1, 100, "2010-01-04"), buy("2", 1, 100, "2024-01-02"), sell("3", 2, 150, "2024-06-03")],
        }),
      ],
      usd({ "2024-01-02": 1.1, "2024-06-03": 1.08 }),
    );

    const year = firstItem(report.years);
    expect(year.net).toBeCloseTo(100 / 1.08, 9);
    expect(itemAt(year.sales, 0).eur?.fxDifference).toBeNull();
    expect(itemAt(year.sales, 0).eur?.buyRates.map((r) => r?.date ?? null)).toEqual([null, "2024-01-02"]);
    expect(year.fxDifference).toBe(0);
    expect(year.fxIncomplete).toBe(1);
    expect(year.total).toBeCloseTo(year.net, 9);
  });

  it("in euros there is no FX difference and no rate series is needed", () => {
    const report = build([
      position({ id: "a", lots: [buy("1", 2, 10, "2024-01-01"), sell("2", 2, 12, "2024-03-01")] }),
    ]);
    const sale = firstItem(itemAt(report.years, 0).sales);
    expect(sale.eur).toMatchObject({ gain: 4, fxDifference: 0, sellRate: { unitsPerEur: 1 } });
    expect(itemAt(report.years, 0).fxIncomplete).toBe(0);
  });

  it("uses the last published rate when the sale falls on a weekend", () => {
    const report = build(
      [
        position({
          id: "usd",
          currency: "USD",
          lots: [buy("1", 1, 100, "2024-01-02"), sell("2", 1, 120, "2024-06-08")],
        }),
      ],
      // 2024-06-08 is a Saturday: Friday the 7th's rate applies.
      usd({ "2024-01-02": 1.1, "2024-06-07": 1.08, "2024-06-10": 1.5 }),
    );
    expect(itemAt(itemAt(report.years, 0).sales, 0).eur?.sellRate.date).toBe("2024-06-07");
  });

  it("adds several sales of the same position into one row and keeps each sale for the CSV", () => {
    const report = build([
      position({
        id: "a",
        name: "Fondo A",
        lots: [buy("1", 10, 10, "2024-01-01"), sell("2", 3, 12, "2024-03-01"), sell("3", 3, 14, "2024-09-01")],
      }),
    ]);

    const year = firstItem(report.years);
    const row = firstItem(year.rows);
    expect(row).toMatchObject({ ticker: "A", name: "Fondo A", sales: 2, quantity: 6, gain: 18 });
    expect(year.sales.map((s) => [s.lotId, s.tradedAt, s.gain])).toEqual([
      ["2", "2024-03-01", 6],
      ["3", "2024-09-01", 12],
    ]);
  });

  it("a fully sold position still counts", () => {
    const report = build([
      position({ id: "a", lots: [buy("1", 5, 10, "2024-01-01"), sell("2", 5, 30, "2024-12-31")] }),
    ]);
    expect(itemAt(report.years, 0).net).toBe(100);
  });

  it("a sale on 31 December and one on 1 January go to different tax years", () => {
    const report = build([
      position({
        id: "a",
        lots: [buy("1", 2, 10, "2023-01-01"), sell("2", 1, 20, "2023-12-31"), sell("3", 1, 20, "2024-01-01")],
      }),
    ]);
    expect(report.years.map((y) => y.year)).toEqual([2024, 2023]);
  });

  it("applies FIFO to the whole security, even when it is split across two brokers", () => {
    // Bought at one broker in 2020 at 50 and at another in 2023 at 90; sold at the second. For the
    // tax authority (Hacienda) the 2020 purchase goes out first, wherever it is held.
    const report = build([
      position({ id: "degiro", ticker: "IWDA", lots: [buy("1", 10, 50, "2020-01-01")] }),
      position({
        id: "myinvestor",
        ticker: "iwda",
        lots: [buy("2", 10, 90, "2023-01-01"), sell("3", 5, 100, "2024-06-01")],
      }),
    ]);

    const year = firstItem(report.years);
    expect(year.net).toBe(250);
    // The sale is attributed to the position where it was recorded.
    expect(year.rows.map((r) => r.positionId)).toEqual(["myinvestor"]);
  });

  it("does not match the same symbol across different currencies", () => {
    const report = build([
      position({ id: "eur", ticker: "X", lots: [buy("1", 1, 10, "2020-01-01")] }),
      position({
        id: "usd",
        ticker: "X",
        currency: "USD",
        lots: [buy("2", 1, 50, "2021-01-01"), sell("3", 1, 60, "2024-01-01")],
      }),
    ]);
    expect(itemAt(report.years, 0).unconverted).toEqual([{ currency: "USD", sales: 1, gain: 10 }]);
  });
});

describe("referenceRatesNeeded", () => {
  it("requests the currencies with sales from their oldest trade onwards", () => {
    expect(
      referenceRatesNeeded([
        position({ id: "eur", lots: [buy("1", 1, 1, "2010-01-01"), sell("2", 1, 1, "2011-01-01")] }),
        position({ id: "usd", currency: "USD", lots: [buy("3", 1, 1, "2019-05-02"), sell("4", 1, 1, "2024-01-01")] }),
        position({ id: "chf", currency: "CHF", lots: [buy("5", 1, 1, "2015-01-01")] }),
        position({ id: "gbp", currency: "GBP", lots: [buy("6", 1, 1, "2021-03-01"), sell("7", 1, 1, "2022-01-01")] }),
      ]),
    ).toEqual({ currencies: ["GBP", "USD"], from: "2019-05-02" });
  });

  it("includes the old purchase of the same security at another broker, which FIFO may match", () => {
    expect(
      referenceRatesNeeded([
        position({ id: "a", ticker: "AAPL", currency: "USD", lots: [buy("1", 1, 1, "2019-03-01")] }),
        position({
          id: "b",
          ticker: "aapl",
          currency: "USD",
          lots: [buy("2", 1, 1, "2024-01-02"), sell("3", 1, 1, "2024-06-03")],
        }),
      ]),
    ).toEqual({ currencies: ["USD"], from: "2019-03-01" });
  });

  it("needs no rate without foreign-currency sales", () => {
    expect(
      referenceRatesNeeded([
        position({ id: "eur", lots: [buy("1", 1, 1, "2010-01-01"), sell("2", 1, 1, "2011-01-01")] }),
      ]),
    ).toBeNull();
    expect(referenceRatesNeeded([])).toBeNull();
  });
});

describe("buildRealisedGainsReport — two-month rule (art. 33.5.f LIRPF)", () => {
  // Case T.S.A. from the Manual práctico de Renta 2025, ch. 11: the €4,800 loss is not included.
  const tsa = [buy("old", 1000, 16.8, "2015-05-25"), sell("s1", 1000, 12, "2025-07-16")];
  const rebuy = buy("re", 1000, 16.5, "2025-08-16");

  it("case T.S.A.: the €4,800 loss is not included in 2025", () => {
    const year = firstItem(build([position({ id: "a", lots: [...tsa, rebuy] })]).years);

    expect(itemAt(year.sales, 0).gain).toBeCloseTo(-4800, 6);
    expect(itemAt(year.sales, 0).deferredLoss).toBeCloseTo(-4800, 6);
    expect(year.deferred).toBeCloseTo(-4800, 6);
    expect(year.integrated).toBe(0);
    expect(year.losses).toBeCloseTo(0, 6);
    expect(year.net).toBeCloseTo(0, 6);
    expect(year.total).toBeCloseTo(0, 6);
    expect(itemAt(year.rows, 0).gain).toBeCloseTo(0, 6);
  });

  it("without a repurchase the loss is included in its own tax year", () => {
    const year = firstItem(build([position({ id: "a", lots: tsa })]).years);

    expect(year.deferred).toBe(0);
    expect(year.net).toBeCloseTo(-4800, 6);
  });

  it("partial repurchase: only the proportional part is deferred", () => {
    const year = firstItem(build([position({ id: "a", lots: [...tsa, buy("re", 250, 16.5, "2025-08-16")] })]).years);

    expect(year.deferred).toBeCloseTo(-1200, 6);
    expect(year.net).toBeCloseTo(-3600, 6);
  });

  it("the deferred loss is included in the tax year in which the repurchased shares are sold", () => {
    const report = build([position({ id: "a", lots: [...tsa, rebuy, sell("s2", 1000, 17, "2026-09-01")] })]);
    const [y2026, y2025] = takeItems(report.years, 2);

    expect(y2025.net).toBeCloseTo(0, 6);
    // 2026 sale: its own €500 gain minus the €4,800 loss it unlocks.
    expect(itemAt(y2026.sales, 0).gain).toBeCloseTo(500, 6);
    expect(y2026.integrated).toBeCloseTo(-4800, 6);
    expect(itemAt(y2026.sales, 0).integratedFrom.map((p) => p.fromSaleId)).toEqual(["s1"]);
    expect(y2026.net).toBeCloseTo(-4300, 6);
  });

  it("the deferred loss is included at its euro amount as of the original sale date", () => {
    const rates = usd({ "2015-05-25": 1, "2025-07-16": 1.25, "2025-08-16": 1.1, "2026-09-01": 1.5 });
    const lots = [...tsa, rebuy, sell("s2", 1000, 17, "2026-09-01")];
    const [y2026, y2025] = takeItems(build([position({ id: "a", currency: "USD", lots })], rates).years, 2);

    // USD −4,800 at 1.25 USD/EUR = €−3,840, not €−3,200 (the 2026 rate).
    expect(y2025.deferred).toBeCloseTo(-3840, 6);
    expect(y2026.integrated).toBeCloseTo(-3840, 6);
  });

  it("warrants and certificates (derivatives with an ISIN) are also covered: they are tradable securities", () => {
    // V2172-21 and V3755-16 only exclude contracts (options, futures); V1790-07 treats warrants as securities.
    const year = firstItem(build([position({ id: "a", isDerivative: true, lots: [...tsa, rebuy] })]).years);

    expect(year.deferred).toBeCloseTo(-4800, 6);
  });

  it("a repurchase in another position of the same security also blocks", () => {
    const year = firstItem(
      build([position({ id: "a", ticker: "TSA", lots: tsa }), position({ id: "b", ticker: "TSA", lots: [rebuy] })])
        .years,
    );

    expect(year.deferred).toBeCloseTo(-4800, 6);
  });
});
