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
  it("reparte las operaciones entre sus posiciones conservando su orden", () => {
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

  it("conserva la marca de derivado y los datos de la posición", () => {
    const [result] = toRealisedGainsPositions([position("w", "USD", true)], []);

    expect(result).toEqual({ id: "w", ticker: "W", name: null, currency: "USD", isDerivative: true, lots: [] });
  });

  it("ignora las operaciones de posiciones que no están en la lista", () => {
    expect(itemAt(toRealisedGainsPositions([position("a")], [lot("1", "otra", "buy", "2024-01-01")]), 0).lots).toEqual(
      [],
    );
  });
});

describe("referenceRatesRequest", () => {
  it("es null si todo es en euros", () => {
    const positions = toRealisedGainsPositions([position("a")], [lot("1", "a", "sell", "2024-01-01")]);

    expect(referenceRatesRequest(positions, [income("EUR", "2024-01-01")])).toBeNull();
  });

  it("une las divisas de ventas y cobros desde la fecha más antigua de las dos", () => {
    const positions = toRealisedGainsPositions(
      [position("a", "USD")],
      [lot("1", "a", "buy", "2023-05-01"), lot("2", "a", "sell", "2024-01-01")],
    );

    expect(referenceRatesRequest(positions, [income("GBP", "2022-07-01"), income("USD", "2024-02-01")])).toEqual({
      currencies: ["GBP", "USD"],
      from: "2022-07-01",
    });
  });

  it("sirve con solo ventas o solo cobros", () => {
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
