import { describe, expect, it } from "vitest";

import {
  buildHistorySeries,
  DEFAULT_HISTORY_RANGE,
  gainSince,
  HISTORY_RANGES,
  MIN_HISTORY_POINTS,
  withLivePoint,
} from "./history-series.js";
import type { HistoryPointDto } from "./types.js";

/** Minimal series point: the remaining fields do not affect the construction. */
function point(date: string, invested: number | null, marketValue: number | null, estimated = false): HistoryPointDto {
  return {
    date,
    invested,
    marketValue,
    pnlAbs: invested !== null && marketValue !== null ? marketValue - invested : null,
    pnlPct: null,
    valuedPositions: 1,
    totalPositions: 1,
    estimated,
  };
}

describe("buildHistorySeries", () => {
  it("an empty series is not plottable", () => {
    const series = buildHistorySeries([]);
    expect(series.points).toEqual([]);
    expect(series.insufficient).toBe(true);
    expect(series.changeAbs).toBeNull();
    expect(series.changePct).toBeNull();
    expect(series.from).toBeNull();
    expect(series.to).toBeNull();
  });

  it("a single point (brand-new account) is not plottable yet", () => {
    const series = buildHistorySeries([point("2026-01-01", 1000, 1100)]);
    expect(series.points).toHaveLength(1);
    expect(series.insufficient).toBe(true);
    expect(series.changeAbs).toBeNull();
    expect(series.from).toBe("2026-01-01");
    expect(series.to).toBe("2026-01-01");
  });

  it("two points are enough and summarize the period's change", () => {
    const series = buildHistorySeries([point("2026-01-01", 1000, 1000), point("2026-01-31", 1000, 1250)]);

    expect(series.insufficient).toBe(false);
    expect(series.changeAbs).toBe(250);
    expect(series.changePct).toBeCloseTo(25, 10);
    expect(series.from).toBe("2026-01-01");
    expect(series.to).toBe("2026-01-31");
  });

  it("a drop yields a negative change", () => {
    const series = buildHistorySeries([point("2026-01-01", 1000, 2000), point("2026-02-01", 1000, 1500)]);

    expect(series.changeAbs).toBe(-500);
    expect(series.changePct).toBeCloseTo(-25, 10);
  });

  it("drops non-convertible points and counts them instead of drawing zeros", () => {
    const series = buildHistorySeries([
      point("2026-01-01", 1000, 1000),
      point("2026-01-02", null, 1200),
      point("2026-01-03", 1000, null),
      point("2026-01-04", 1000, 1100),
    ]);

    expect(series.points.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-04"]);
    expect(series.dropped).toBe(2);
    expect(series.changeAbs).toBe(100);
  });

  it("also drops non-finite amounts", () => {
    const series = buildHistorySeries([
      point("2026-01-01", Number.NaN, 1000),
      point("2026-01-02", 1000, Number.POSITIVE_INFINITY),
      point("2026-01-03", 1000, 1100),
    ]);

    expect(series.points).toHaveLength(1);
    expect(series.dropped).toBe(2);
    expect(series.insufficient).toBe(true);
  });

  it("sorts chronologically even if the API returned them out of order", () => {
    const series = buildHistorySeries([
      point("2026-03-01", 1000, 1300),
      point("2026-01-01", 1000, 1000),
      point("2026-02-01", 1000, 1200),
    ]);

    expect(series.points.map((p) => p.date)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(series.changeAbs).toBe(300);
  });

  it("does not compute the percentage when starting from zero (avoids dividing by 0)", () => {
    const series = buildHistorySeries([point("2026-01-01", 0, 0), point("2026-01-02", 100, 120)]);

    expect(series.changeAbs).toBe(120);
    expect(series.changePct).toBeNull();
  });

  it("without estimated points, estimatedRanges is empty", () => {
    const series = buildHistorySeries([point("2026-01-01", 1000, 1000), point("2026-01-02", 1000, 1100)]);
    expect(series.estimatedRanges).toEqual([]);
  });

  it("computes the run of estimated (reconstructed) points at the start of the series", () => {
    const series = buildHistorySeries([
      point("2026-01-01", 1000, 1000, true),
      point("2026-01-02", 1000, 1050, true),
      point("2026-01-03", 1000, 1100, false),
    ]);
    expect(series.estimatedRanges).toEqual([{ from: "2026-01-01", to: "2026-01-02" }]);
  });

  it("a dropped (non-convertible) point does not count towards the runs", () => {
    const series = buildHistorySeries([
      point("2026-01-01", null, null, true),
      point("2026-01-02", 1000, 1050, true),
      point("2026-01-03", 1000, 1100, false),
    ]);
    expect(series.estimatedRanges).toEqual([{ from: "2026-01-02", to: "2026-01-02" }]);
  });

  it("shades each estimated run separately, without swallowing the real points in between", () => {
    const series = buildHistorySeries([
      point("2026-01-01", 1000, 1000, true),
      point("2026-01-05", 1000, 1100, false),
      point("2026-01-10", 1000, 1200, false),
      point("2026-01-15", 1000, 1300, true),
      point("2026-01-16", 1000, 1310, true),
    ]);
    expect(series.estimatedRanges).toEqual([
      { from: "2026-01-01", to: "2026-01-01" },
      { from: "2026-01-15", to: "2026-01-16" },
    ]);
  });

  it("the offered ranges are increasing and the default range exists", () => {
    const days = HISTORY_RANGES.map((r) => r.days);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(HISTORY_RANGES.some((r) => r.key === DEFAULT_HISTORY_RANGE)).toBe(true);
    // The cap matches the backend's `HISTORY_MAX_DAYS`: requesting more would return a 400.
    expect(Math.max(...days)).toBe(1825);
    expect(MIN_HISTORY_POINTS).toBe(2);
  });
});

describe("gainSince", () => {
  const point = (date: string, invested: number, marketValue: number, estimated = false): HistoryPointDto => ({
    date,
    invested,
    marketValue,
    pnlAbs: marketValue - invested,
    pnlPct: null,
    valuedPositions: 1,
    totalPositions: 1,
    estimated,
  });

  it("does not count a contribution as a gain", () => {
    // From 2 January to 30 June the value rises by 1,500, but 1,000 of it is contributions.
    const result = gainSince([point("2026-01-02", 10_000, 11_000), point("2026-06-30", 11_000, 12_500)], "2026-01-01");
    expect(result).toEqual({ gain: 500, since: "2026-01-02", estimated: false });
  });

  it("ignores what comes before the date and flags an estimated starting point", () => {
    const result = gainSince(
      [point("2025-12-31", 0, 0), point("2026-03-01", 100, 120, true), point("2026-04-01", 100, 90)],
      "2026-01-01",
    );
    expect(result).toEqual({ gain: -30, since: "2026-03-01", estimated: true });
  });

  it("returns null with fewer than two usable points", () => {
    expect(gainSince([point("2026-02-01", 1, 1)], "2026-01-01")).toBeNull();
    expect(gainSince([], "2026-01-01")).toBeNull();
  });
});

describe("withLivePoint", () => {
  const snapshot = (date: string) => ({
    date,
    invested: 100,
    marketValue: 110,
    pnlAbs: 10,
    pnlPct: 10,
    valuedPositions: 1,
    totalPositions: 1,
    estimated: false,
  });
  const live = {
    date: "2026-10-01",
    marketValue: 120,
    invested: 100,
    pnlAbs: 20,
    pnlPct: 20,
    valuedPositions: 1,
    totalPositions: 1,
  };

  it("ends the series with today's value", () => {
    const points = withLivePoint([snapshot("2026-09-30")], live);
    expect(points.map((p) => p.date)).toEqual(["2026-09-30", "2026-10-01"]);
    expect(points[1]).toMatchObject({ marketValue: 120, estimated: false });
  });

  it("if today already has a snapshot, the snapshot wins", () => {
    expect(withLivePoint([snapshot("2026-10-01")], live)).toHaveLength(1);
  });

  it("adds nothing without a valuation or without valued positions", () => {
    expect(withLivePoint([snapshot("2026-09-30")], null)).toHaveLength(1);
    expect(withLivePoint([snapshot("2026-09-30")], { ...live, valuedPositions: 0 })).toHaveLength(1);
  });

  it("with an empty series, today's point is the only one", () => {
    expect(withLivePoint([], live)).toHaveLength(1);
  });
});
