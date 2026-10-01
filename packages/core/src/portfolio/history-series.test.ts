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

/** Punto de serie con lo mínimo: el resto de campos no influye en la construcción. */
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
  it("una serie vacía no es pintable", () => {
    const series = buildHistorySeries([]);
    expect(series.points).toEqual([]);
    expect(series.insufficient).toBe(true);
    expect(series.changeAbs).toBeNull();
    expect(series.changePct).toBeNull();
    expect(series.from).toBeNull();
    expect(series.to).toBeNull();
  });

  it("un solo punto (cuenta recién creada) todavía no es pintable", () => {
    const series = buildHistorySeries([point("2026-01-01", 1000, 1100)]);
    expect(series.points).toHaveLength(1);
    expect(series.insufficient).toBe(true);
    expect(series.changeAbs).toBeNull();
    expect(series.from).toBe("2026-01-01");
    expect(series.to).toBe("2026-01-01");
  });

  it("dos puntos ya son suficientes y resumen la variación del periodo", () => {
    const series = buildHistorySeries([point("2026-01-01", 1000, 1000), point("2026-01-31", 1000, 1250)]);

    expect(series.insufficient).toBe(false);
    expect(series.changeAbs).toBe(250);
    expect(series.changePct).toBeCloseTo(25, 10);
    expect(series.from).toBe("2026-01-01");
    expect(series.to).toBe("2026-01-31");
  });

  it("una caída da una variación negativa", () => {
    const series = buildHistorySeries([point("2026-01-01", 1000, 2000), point("2026-02-01", 1000, 1500)]);

    expect(series.changeAbs).toBe(-500);
    expect(series.changePct).toBeCloseTo(-25, 10);
  });

  it("descarta los puntos no convertibles y los cuenta en vez de dibujar ceros", () => {
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

  it("descarta también los importes no finitos", () => {
    const series = buildHistorySeries([
      point("2026-01-01", Number.NaN, 1000),
      point("2026-01-02", 1000, Number.POSITIVE_INFINITY),
      point("2026-01-03", 1000, 1100),
    ]);

    expect(series.points).toHaveLength(1);
    expect(series.dropped).toBe(2);
    expect(series.insufficient).toBe(true);
  });

  it("ordena cronológicamente aunque la API los devolviera desordenados", () => {
    const series = buildHistorySeries([
      point("2026-03-01", 1000, 1300),
      point("2026-01-01", 1000, 1000),
      point("2026-02-01", 1000, 1200),
    ]);

    expect(series.points.map((p) => p.date)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(series.changeAbs).toBe(300);
  });

  it("no calcula el porcentaje si se partía de cero (evita dividir por 0)", () => {
    const series = buildHistorySeries([point("2026-01-01", 0, 0), point("2026-01-02", 100, 120)]);

    expect(series.changeAbs).toBe(120);
    expect(series.changePct).toBeNull();
  });

  it("sin puntos estimados, estimatedRanges está vacío", () => {
    const series = buildHistorySeries([point("2026-01-01", 1000, 1000), point("2026-01-02", 1000, 1100)]);
    expect(series.estimatedRanges).toEqual([]);
  });

  it("calcula el tramo de puntos estimados (reconstrucción) al principio de la serie", () => {
    const series = buildHistorySeries([
      point("2026-01-01", 1000, 1000, true),
      point("2026-01-02", 1000, 1050, true),
      point("2026-01-03", 1000, 1100, false),
    ]);
    expect(series.estimatedRanges).toEqual([{ from: "2026-01-01", to: "2026-01-02" }]);
  });

  it("un punto descartado (no convertible) no cuenta para los tramos", () => {
    const series = buildHistorySeries([
      point("2026-01-01", null, null, true),
      point("2026-01-02", 1000, 1050, true),
      point("2026-01-03", 1000, 1100, false),
    ]);
    expect(series.estimatedRanges).toEqual([{ from: "2026-01-02", to: "2026-01-02" }]);
  });

  it("sombrea por separado cada tramo estimado, sin tragarse los reales de en medio", () => {
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

  it("los rangos ofrecidos son crecientes y el rango por defecto existe", () => {
    const days = HISTORY_RANGES.map((r) => r.days);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(HISTORY_RANGES.some((r) => r.key === DEFAULT_HISTORY_RANGE)).toBe(true);
    // El tope coincide con el `HISTORY_MAX_DAYS` del backend: pedir más daría 400.
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

  it("no cuenta una aportación como ganancia", () => {
    // Del 2 de enero al 30 de junio el valor sube 1.500, pero 1.000 son aportación.
    const result = gainSince([point("2026-01-02", 10_000, 11_000), point("2026-06-30", 11_000, 12_500)], "2026-01-01");
    expect(result).toEqual({ gain: 500, since: "2026-01-02", estimated: false });
  });

  it("ignora lo anterior a la fecha y avisa si el punto de partida es estimado", () => {
    const result = gainSince(
      [point("2025-12-31", 0, 0), point("2026-03-01", 100, 120, true), point("2026-04-01", 100, 90)],
      "2026-01-01",
    );
    expect(result).toEqual({ gain: -30, since: "2026-03-01", estimated: true });
  });

  it("devuelve null con menos de dos puntos utilizables", () => {
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

  it("cierra la serie con el valor de hoy", () => {
    const points = withLivePoint([snapshot("2026-09-30")], live);
    expect(points.map((p) => p.date)).toEqual(["2026-09-30", "2026-10-01"]);
    expect(points[1]).toMatchObject({ marketValue: 120, estimated: false });
  });

  it("si ya hay snapshot de hoy, manda el snapshot", () => {
    expect(withLivePoint([snapshot("2026-10-01")], live)).toHaveLength(1);
  });

  it("no añade nada sin valoración o sin posiciones valoradas", () => {
    expect(withLivePoint([snapshot("2026-09-30")], null)).toHaveLength(1);
    expect(withLivePoint([snapshot("2026-09-30")], { ...live, valuedPositions: 0 })).toHaveLength(1);
  });

  it("con la serie vacía, el punto de hoy es el único", () => {
    expect(withLivePoint([], live)).toHaveLength(1);
  });
});
