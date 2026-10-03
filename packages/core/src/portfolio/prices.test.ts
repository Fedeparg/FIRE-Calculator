import { describe, expect, it } from "vitest";

import { isPricePending, isStalePrice, latestFetchedAt, latestPriceDate, PENDING_PRICE_WINDOW_MS } from "./prices.js";

const prices = (dates: Record<string, string>) =>
  Object.fromEntries(Object.entries(dates).map(([ticker, date]) => [ticker, { date }]));

describe("latestPriceDate", () => {
  it("returns the most recent date of all", () => {
    expect(latestPriceDate(prices({ IWDA: "2026-03-13", VWCE: "2026-03-15", FUND: "2026-03-10" }))).toBe("2026-03-15");
  });

  it("with a single price it returns that price's date", () => {
    expect(latestPriceDate(prices({ IWDA: "2026-03-13" }))).toBe("2026-03-13");
  });

  it("without prices there is no reference", () => {
    expect(latestPriceDate({})).toBeNull();
  });

  it("ignores unreadable dates instead of polluting the maximum", () => {
    expect(latestPriceDate(prices({ A: "2026-03-13", B: "yesterday", C: "2026-3-9" }))).toBe("2026-03-13");
  });

  it("without any readable date there is no reference", () => {
    expect(latestPriceDate(prices({ A: "", B: "yesterday" }))).toBeNull();
  });

  it("tolerates gaps in the record (symbol without a price)", () => {
    expect(latestPriceDate({ IWDA: undefined, VWCE: { date: "2026-03-15" } })).toBe("2026-03-15");
  });

  it("crosses year and month boundaries comparing as text", () => {
    expect(latestPriceDate(prices({ A: "2025-12-31", B: "2026-01-01" }))).toBe("2026-01-01");
    expect(latestPriceDate(prices({ A: "2026-01-31", B: "2026-02-01" }))).toBe("2026-02-01");
  });
});

describe("isStalePrice", () => {
  const latest = "2026-03-15";

  it("flags a price older than the last refresh", () => {
    expect(isStalePrice({ date: "2026-03-10" }, latest)).toBe(true);
  });

  it("does not flag a price from the refresh day itself", () => {
    expect(isStalePrice({ date: latest }, latest)).toBe(false);
  });

  it('does not flag a row without a price: "—" already says so', () => {
    expect(isStalePrice(undefined, latest)).toBe(false);
  });

  it("without a reference it flags nothing", () => {
    expect(isStalePrice({ date: "2026-03-10" }, null)).toBe(false);
  });

  it("an unreadable date is not flagged as stale", () => {
    expect(isStalePrice({ date: "yesterday" }, latest)).toBe(false);
  });

  it("does not flag a date later than the reference (impossible, but not inverted)", () => {
    expect(isStalePrice({ date: "2026-03-20" }, latest)).toBe(false);
  });

  it("when all prices are equally old none is flagged", () => {
    const all = prices({ A: "2026-03-01", B: "2026-03-01" });
    const reference = latestPriceDate(all);
    expect(Object.values(all).every((p) => !isStalePrice(p, reference))).toBe(true);
  });
});

describe("latestFetchedAt", () => {
  it("returns the most recent read instant", () => {
    expect(
      latestFetchedAt({
        IWDA: { fetchedAt: "2026-09-28T09:00:03.000Z" },
        VWCE: { fetchedAt: "2026-09-28T11:00:05.000Z" },
        FUND: { fetchedAt: "2026-09-27T20:30:00.000Z" },
      }),
    ).toBe("2026-09-28T11:00:05.000Z");
  });

  it("ignores entries that lack it or cannot be parsed", () => {
    expect(latestFetchedAt({ A: {}, B: { fetchedAt: "garbage" }, C: undefined })).toBeNull();
    expect(latestFetchedAt({ A: { fetchedAt: "garbage" }, B: { fetchedAt: "2026-01-01T00:00:00Z" } })).toBe(
      "2026-01-01T00:00:00Z",
    );
  });

  it("without prices there is no instant", () => {
    expect(latestFetchedAt({})).toBeNull();
  });
});

describe("isPricePending", () => {
  const created = "2026-10-01T10:00:00.000Z";
  const createdMs = Date.parse(created);
  const position = { isDerivative: false, createdAt: created };

  it("is pending right after creation when there is no price", () => {
    expect(isPricePending(position, undefined, createdMs)).toBe(true);
  });

  it("stops being pending exactly when the window elapses", () => {
    const edge = createdMs + PENDING_PRICE_WINDOW_MS;
    expect(isPricePending(position, undefined, edge - 1)).toBe(true);
    expect(isPricePending(position, undefined, edge)).toBe(false);
  });

  it("is not pending once it has a price", () => {
    expect(isPricePending(position, { close: 1 }, createdMs)).toBe(false);
  });

  it("derivatives are never pending", () => {
    expect(isPricePending({ ...position, isDerivative: true }, undefined, createdMs)).toBe(false);
  });

  it("an unreadable date is not pending", () => {
    expect(isPricePending({ ...position, createdAt: "nope" }, undefined, createdMs)).toBe(false);
  });

  it("a negative age (clock skew) counts as just created", () => {
    expect(isPricePending(position, undefined, createdMs - 5_000)).toBe(true);
  });

  it("accepts a custom window", () => {
    expect(isPricePending(position, undefined, createdMs + 5_000, 1_000)).toBe(false);
  });
});
