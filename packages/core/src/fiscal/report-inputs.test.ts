import { describe, expect, it } from "vitest";

import type { IncomeEvent } from "./income.js";
import { referenceRatesRequest, toRealisedGainsPositions, type RealisedGainsLotSource } from "./report-inputs.js";
import { itemAt } from "../arrays.js";

const position = (id: string, currency = "EUR", isDerivative = false) => ({
  id,
  ticker: id.toUpperCase(),
  name: null,
  currency,
  isDerivative,
});

const lot = (id: string, positionId: string, kind: "buy" | "sell", tradedAt: string): RealisedGainsLotSource => ({
  id,
  positionId,
  kind,
  quantity: 1,
  price: 10,
  fees: 0,
  tradedAt,
});

const income = (currency: string, paidAt: string): IncomeEvent =>
  ({ currency, paidAt, kind: "dividend", gross: 1 }) as Partial<IncomeEvent> as IncomeEvent;

describe("toRealisedGainsPositions", () => {
  it("distributes trades among their positions keeping their order", () => {
    const lots = [
      lot("1", "a", "buy", "2024-01-01"),
      lot("2", "b", "buy", "2024-02-01"),
      lot("3", "a", "sell", "2024-03-01"),
    ];

    const result = toRealisedGainsPositions([position("a"), position("b"), position("c")], lots);

    expect(result.map((p) => [p.id, p.lots.map((l) => l.id)])).toEqual([
      ["a", ["1", "3"]],
      ["b", ["2"]],
      ["c", []],
    ]);
  });

  it("keeps the derivative flag and the position data", () => {
    const [result] = toRealisedGainsPositions([position("w", "USD", true)], []);

    expect(result).toEqual({ id: "w", ticker: "W", name: null, currency: "USD", isDerivative: true, lots: [] });
  });

  it("ignores trades of positions that are not in the list", () => {
    expect(itemAt(toRealisedGainsPositions([position("a")], [lot("1", "other", "buy", "2024-01-01")]), 0).lots).toEqual(
      [],
    );
  });
});

describe("referenceRatesRequest", () => {
  it("is null when everything is in euros", () => {
    const positions = toRealisedGainsPositions([position("a")], [lot("1", "a", "sell", "2024-01-01")]);

    expect(referenceRatesRequest(positions, [income("EUR", "2024-01-01")])).toBeNull();
  });

  it("merges the currencies of sales and payments from the older of the two dates", () => {
    const positions = toRealisedGainsPositions(
      [position("a", "USD")],
      [lot("1", "a", "buy", "2023-05-01"), lot("2", "a", "sell", "2024-01-01")],
    );

    expect(referenceRatesRequest(positions, [income("GBP", "2022-07-01"), income("USD", "2024-02-01")])).toEqual({
      currencies: ["GBP", "USD"],
      from: "2022-07-01",
    });
  });

  it("works with only sales or only payments", () => {
    const positions = toRealisedGainsPositions(
      [position("a", "USD")],
      [lot("1", "a", "buy", "2023-05-01"), lot("2", "a", "sell", "2024-01-01")],
    );

    expect(referenceRatesRequest(positions, [])).toEqual({ currencies: ["USD"], from: "2023-05-01" });
    expect(referenceRatesRequest([], [income("CHF", "2021-03-03")])).toEqual({
      currencies: ["CHF"],
      from: "2021-03-03",
    });
  });
});
