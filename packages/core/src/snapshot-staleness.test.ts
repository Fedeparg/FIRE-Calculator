import { describe, expect, it } from "vitest";

import { staleSnapshotDates, type StalenessLot, type StalenessSnapshot } from "./snapshot-staleness.js";

const at = (iso: string): number => Date.parse(iso);

/** Capturas reales diarias de `from` a `to` (ambas incluidas), escritas a las 22:30 de su día. */
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

  it("un lote antiguo añadido DESPUÉS de las capturas invalida las capturas desde su fecha", () => {
    const stale = staleSnapshotDates({
      snapshots,
      lots: [lot("2026-09-04", "2026-10-01T10:00:00Z")],
    });
    expect(sorted(stale)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("un lote con fecha de hoy (posterior a toda captura) no invalida ninguna", () => {
    const stale = staleSnapshotDates({
      snapshots,
      lots: [lot("2026-10-01", "2026-10-01T10:00:00Z")],
    });
    expect(stale.size).toBe(0);
  });

  it("sin lotes cambiados tras las capturas no hay nada obsoleto", () => {
    const stale = staleSnapshotDates({
      snapshots,
      lots: [lot("2026-09-01", "2026-09-01T09:00:00Z"), lot("2026-09-04", "2026-09-04T08:00:00Z")],
    });
    expect(stale.size).toBe(0);
  });

  it("sin lotes o sin capturas devuelve vacío", () => {
    expect(staleSnapshotDates({ snapshots: [], lots: [] }).size).toBe(0);
    expect(staleSnapshotDates({ snapshots, lots: [] }).size).toBe(0);
  });

  it("un lote editado después invalida las capturas anteriores a la edición, no las posteriores", () => {
    // Existía desde el día 3, editado (cantidad/precio) el día 4 a las 23:00.
    const stale = staleSnapshotDates({
      snapshots,
      lots: [lot("2026-09-03", "2026-09-04T23:00:00Z")],
    });
    expect(sorted(stale)).toEqual(["2026-09-03", "2026-09-04"]);
  });

  it("invalidateFrom (lote borrado o movido) invalida desde esa fecha aunque no haya marcas", () => {
    const stale = staleSnapshotDates({ snapshots, lots: [], invalidateFrom: "2026-09-05" });
    expect(sorted(stale)).toEqual(["2026-09-05", "2026-09-06"]);
  });

  it("combina ambas reglas y no depende del orden de entrada", () => {
    const stale = staleSnapshotDates({
      snapshots: [...snapshots].reverse(),
      lots: [lot("2026-09-06", "2026-10-01T10:00:00Z"), lot("2026-09-01", "2026-09-01T10:00:00Z")],
      invalidateFrom: "2026-09-04",
    });
    expect(sorted(stale)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("el escenario de producción: importación de julio-septiembre posterior a las capturas", () => {
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
