import { describe, expect, it } from "vitest";

import type { Position, PriceInfo } from "@sextante/core/portfolio/types";
import { buildPositionRows, toBase, type BuildRowsInput } from "./rows";

const position = (over: Partial<Position> & { id: string; ticker: string }): Position => ({
  name: null,
  quantity: 10,
  avgPrice: 100,
  broker: null,
  currency: "USD",
  isDerivative: false,
  assetClass: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const price = (over: Partial<PriceInfo> & { symbol: string }): PriceInfo => ({
  close: 110,
  currency: "USD",
  date: "2026-09-30",
  fetchedAt: "2026-09-30T20:00:00.000Z",
  previousClose: 100,
  ...over,
});

const base = (over: Partial<BuildRowsInput>): BuildRowsInput => ({
  positions: [],
  prices: {},
  rates: { USD: 1, EUR: 2 },
  display: "USD",
  total: 0,
  latestDate: "2026-09-30",
  pendingIds: new Set(),
  gainMode: "total",
  ...over,
});

describe("toBase", () => {
  it("passes USD through and converts the rest with the USD-per-unit rate", () => {
    expect(toBase(50, "USD", {})).toBe(50);
    expect(toBase(50, "EUR", { EUR: 2 })).toBe(100);
  });

  it("is null without an amount or without a rate", () => {
    expect(toBase(null, "USD", {})).toBeNull();
    expect(toBase(50, "GBP", { EUR: 2 })).toBeNull();
    expect(toBase(50, "EUR", { EUR: 0 })).toBeNull();
  });
});

describe("buildPositionRows", () => {
  const a = position({ id: "a", ticker: "AAA" });
  const b = position({ id: "b", ticker: "BBB", currency: "EUR", name: "Beta" });

  it("values each row and weights it against the total in the display currency", () => {
    const [row] = buildPositionRows(base({ positions: [a], prices: { AAA: price({ symbol: "AAA" }) }, total: 2200 }));
    expect(row.marketValue).toBe(1100);
    expect(row.pnlAbs).toBe(100);
    expect(row.weight).toBe(50);
    expect(row.gain).toEqual({ abs: 100, pct: 10 });
    expect(row.stale).toBe(false);
  });

  it("leaves unpriced rows without value, weight or gain, and flags the pending ones", () => {
    const [row] = buildPositionRows(base({ positions: [a], total: 1000, pendingIds: new Set(["a"]) }));
    expect(row.marketValue).toBeNull();
    expect(row.weight).toBeNull();
    expect(row.gain).toBeNull();
    expect(row.pending).toBe(true);
  });

  it("has no weight when the total is zero", () => {
    const [row] = buildPositionRows(base({ positions: [a], prices: { AAA: price({ symbol: "AAA" }) }, total: 0 }));
    expect(row.weight).toBeNull();
  });

  it("uses the daily gain in today mode", () => {
    const [row] = buildPositionRows(
      base({
        positions: [a],
        prices: { AAA: price({ symbol: "AAA", close: 110, previousClose: 105 }) },
        gainMode: "today",
      }),
    );
    expect(row.gain?.abs).toBe(50);
  });

  it("marks a price older than the latest one as stale", () => {
    const [row] = buildPositionRows(
      base({ positions: [a], prices: { AAA: price({ symbol: "AAA", date: "2026-09-25" }) }, total: 1 }),
    );
    expect(row.stale).toBe(true);
  });

  it("normalises sort amounts to USD so currencies compare fairly", () => {
    const rows = buildPositionRows(
      base({ positions: [b], prices: { BBB: price({ symbol: "BBB", currency: "EUR", close: 100 }) }, total: 1 }),
    );
    expect(rows[0].sortable.marketValue).toBe(2000);
    expect(rows[0].sortable.name).toBe("Beta");
  });

  it("sorts rows without a rate to the end (null) instead of inventing a value", () => {
    const [row] = buildPositionRows(
      base({ positions: [b], prices: { BBB: price({ symbol: "BBB", currency: "EUR" }) }, rates: { USD: 1 } }),
    );
    expect(row.sortable.marketValue).toBeNull();
    expect(row.sortable.invested).toBeNull();
  });
});
