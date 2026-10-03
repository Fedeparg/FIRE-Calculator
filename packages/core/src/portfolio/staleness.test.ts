import { describe, expect, it } from "vitest";

import {
  planSnapshotWrites,
  staleSnapshotDates,
  type SnapshotValues,
  type StalenessLot,
  type StalenessSnapshot,
  type StoredSnapshot,
} from "./staleness.js";
import { itemAt } from "../arrays.js";

const at = (iso: string): number => Date.parse(iso);

/** Daily real snapshots from `from` to `to` (both inclusive), written at 22:30 on their day. */
function dailySnapshots(from: string, to: string): StalenessSnapshot[] {
  const out: StalenessSnapshot[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, writtenAt: at(`${date}T22:30:00Z`) });
  }
  return out;
}

const lot = (tradedAt: string, changedAt: string): StalenessLot => ({ tradedAt, changedAt: at(changedAt) });
const sorted = (set: Set<string>): string[] => [...set].sort();

describe("staleSnapshotDates", () => {
  const snapshots = dailySnapshots("2026-09-03", "2026-09-06");

  it("an old lot added AFTER the snapshots invalidates the snapshots from its date onwards", () => {
    const stale = staleSnapshotDates({
      snapshots,
      lots: [lot("2026-09-04", "2026-10-01T10:00:00Z")],
    });
    expect(sorted(stale)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("a lot dated today (after every snapshot) invalidates none", () => {
    const stale = staleSnapshotDates({
      snapshots,
      lots: [lot("2026-10-01", "2026-10-01T10:00:00Z")],
    });
    expect(stale.size).toBe(0);
  });

  it("with no lots changed after the snapshots nothing is stale", () => {
    const stale = staleSnapshotDates({
      snapshots,
      lots: [lot("2026-09-01", "2026-09-01T09:00:00Z"), lot("2026-09-04", "2026-09-04T08:00:00Z")],
    });
    expect(stale.size).toBe(0);
  });

  it("returns empty without lots or without snapshots", () => {
    expect(staleSnapshotDates({ snapshots: [], lots: [] }).size).toBe(0);
    expect(staleSnapshotDates({ snapshots, lots: [] }).size).toBe(0);
  });

  it("a lot edited later invalidates the snapshots before the edit, not those after it", () => {
    // Existed since day 3, edited (quantity/price) on day 4 at 23:00.
    const stale = staleSnapshotDates({
      snapshots,
      lots: [lot("2026-09-03", "2026-09-04T23:00:00Z")],
    });
    expect(sorted(stale)).toEqual(["2026-09-03", "2026-09-04"]);
  });

  it("invalidateFrom (lot deleted or moved) invalidates from that date even without traces", () => {
    const stale = staleSnapshotDates({ snapshots, lots: [], invalidateFrom: "2026-09-05" });
    expect(sorted(stale)).toEqual(["2026-09-05", "2026-09-06"]);
  });

  it("combines both rules and does not depend on input order", () => {
    const stale = staleSnapshotDates({
      snapshots: [...snapshots].reverse(),
      lots: [lot("2026-09-06", "2026-10-01T10:00:00Z"), lot("2026-09-01", "2026-09-01T10:00:00Z")],
      invalidateFrom: "2026-09-04",
    });
    expect(sorted(stale)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("the production scenario: a July–September import made after the snapshots", () => {
    const real = dailySnapshots("2026-09-03", "2026-09-30");
    const stale = staleSnapshotDates({
      snapshots: real,
      lots: [
        lot("2026-07-15", "2026-10-01T09:00:00Z"),
        lot("2026-09-09", "2026-10-01T09:00:00Z"),
        lot("2026-09-23", "2026-10-01T09:00:00Z"),
      ],
    });
    expect(stale.size).toBe(real.length);
  });
});

describe("planSnapshotWrites", () => {
  const values = (date: string, invested = "100.00000000", fxRates = { USD: 1, EUR: 1.1 }): SnapshotValues => ({
    date,
    invested,
    marketValue: "110.00000000",
    valuedPositions: 1,
    totalPositions: 1,
    fxRates,
  });
  const stored = (date: string, estimated: boolean, invested?: string): StoredSnapshot => ({
    ...values(date, invested),
    estimated,
  });
  const plan = (rows: SnapshotValues[], existing: StoredSnapshot[], staleReal: string[] = []) =>
    planSnapshotWrites({ rows, existing, staleReal: new Set(staleReal), trackingSince: "2026-09-10" });

  it("writes the new days and marks those before tracking as estimated", () => {
    const { changed, stale } = plan([values("2026-09-09"), values("2026-09-10")], []);

    expect(changed.map((row) => [row.date, row.estimated])).toEqual([
      ["2026-09-09", true],
      ["2026-09-10", false],
    ]);
    expect(stale).toEqual([]);
  });

  it("does not rewrite an identical estimate, even if the rates come in a different order", () => {
    const existing = [stored("2026-09-01", true)];
    const rows = [values("2026-09-01", "100.00000000", { EUR: 1.1, USD: 1 })];

    expect(plan(rows, existing).changed).toEqual([]);
  });

  it("rewrites an estimate if a value changes or if its flag no longer follows the rule", () => {
    expect(plan([values("2026-09-01", "200.00000000")], [stored("2026-09-01", true)]).changed).toHaveLength(1);
    // After tracking started but stored as estimated: corrected to real.
    const repaired = plan([values("2026-09-15")], [stored("2026-09-15", true)]).changed;
    expect(repaired).toMatchObject([{ date: "2026-09-15", estimated: false }]);
  });

  it("only overwrites a real snapshot if it is stale", () => {
    const existing = [stored("2026-09-15", false, "999.00000000"), stored("2026-09-16", false, "999.00000000")];
    const rows = [values("2026-09-15"), values("2026-09-16")];

    expect(plan(rows, existing).changed).toEqual([]);
    expect(plan(rows, existing, ["2026-09-16"]).changed.map((row) => row.date)).toEqual(["2026-09-16"]);
  });

  it("removes the estimates the reconstruction no longer produces, never the real ones", () => {
    const existing = [stored("2026-09-01", true), stored("2026-09-02", false), stored("2026-09-03", true)];

    expect(plan([values("2026-09-03")], existing).stale).toEqual(["2026-09-01"]);
  });

  it("preserves each row's own fields (e.g. the user)", () => {
    const { changed } = planSnapshotWrites({
      rows: [{ ...values("2026-09-20"), userId: "u1" }],
      existing: [],
      staleReal: new Set(),
      trackingSince: "2026-09-10",
    });

    expect(itemAt(changed, 0).userId).toBe("u1");
    expect(itemAt(changed, 0).estimated).toBe(false);
  });
});
