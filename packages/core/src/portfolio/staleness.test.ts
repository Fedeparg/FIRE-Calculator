import { describe, expect, it } from "vitest";

import {
  planSnapshotWrites,
  staleSnapshotDates,
  type SnapshotValues,
  type StalenessLot,
  type StalenessSnapshot,
  type StoredSnapshot,
} from "./staleness.js";

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

  it("escribe los días nuevos y marca como estimados los anteriores al seguimiento", () => {
    const { changed, stale } = plan([values("2026-09-09"), values("2026-09-10")], []);

    expect(changed.map((row) => [row.date, row.estimated])).toEqual([
      ["2026-09-09", true],
      ["2026-09-10", false],
    ]);
    expect(stale).toEqual([]);
  });

  it("no reescribe una estimación idéntica, aunque las tasas vengan en otro orden", () => {
    const existing = [stored("2026-09-01", true)];
    const rows = [values("2026-09-01", "100.00000000", { EUR: 1.1, USD: 1 })];

    expect(plan(rows, existing).changed).toEqual([]);
  });

  it("reescribe una estimación si cambia un valor o si su marca ya no cumple la regla", () => {
    expect(plan([values("2026-09-01", "200.00000000")], [stored("2026-09-01", true)]).changed).toHaveLength(1);
    // Posterior al seguimiento guardada como estimada: se corrige a real.
    const repaired = plan([values("2026-09-15")], [stored("2026-09-15", true)]).changed;
    expect(repaired).toMatchObject([{ date: "2026-09-15", estimated: false }]);
  });

  it("solo pisa una captura real si está obsoleta", () => {
    const existing = [stored("2026-09-15", false, "999.00000000"), stored("2026-09-16", false, "999.00000000")];
    const rows = [values("2026-09-15"), values("2026-09-16")];

    expect(plan(rows, existing).changed).toEqual([]);
    expect(plan(rows, existing, ["2026-09-16"]).changed.map((row) => row.date)).toEqual(["2026-09-16"]);
  });

  it("retira las estimaciones que ya no salen de la reconstrucción, nunca las reales", () => {
    const existing = [stored("2026-09-01", true), stored("2026-09-02", false), stored("2026-09-03", true)];

    expect(plan([values("2026-09-03")], existing).stale).toEqual(["2026-09-01"]);
  });

  it("conserva los campos propios de cada fila (p. ej. el usuario)", () => {
    const { changed } = planSnapshotWrites({
      rows: [{ ...values("2026-09-20"), userId: "u1" }],
      existing: [],
      staleReal: new Set(),
      trackingSince: "2026-09-10",
    });

    expect(changed[0].userId).toBe("u1");
    expect(changed[0].estimated).toBe(false);
  });
});
