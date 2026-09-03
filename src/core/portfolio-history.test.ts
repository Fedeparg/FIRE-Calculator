import { describe, expect, it } from "vitest";

import {
  buildHistorySeries,
  DEFAULT_HISTORY_RANGE,
  HISTORY_RANGES,
  MIN_HISTORY_POINTS,
  type HistoryPointDto,
} from "./portfolio-history";

/** Punto de serie con lo mínimo: el resto de campos no influye en la construcción. */
function point(
  date: string,
  invested: number | null,
  marketValue: number | null,
): HistoryPointDto {
  return {
    date,
    invested,
    marketValue,
    pnlAbs: invested !== null && marketValue !== null ? marketValue - invested : null,
    pnlPct: null,
    valuedPositions: 1,
    totalPositions: 1,
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
    const series = buildHistorySeries([
      point("2026-01-01", 1000, 1000),
      point("2026-01-31", 1000, 1250),
    ]);

    expect(series.insufficient).toBe(false);
    expect(series.changeAbs).toBe(250);
    expect(series.changePct).toBeCloseTo(25, 10);
    expect(series.from).toBe("2026-01-01");
    expect(series.to).toBe("2026-01-31");
  });

  it("una caída da una variación negativa", () => {
    const series = buildHistorySeries([
      point("2026-01-01", 1000, 2000),
      point("2026-02-01", 1000, 1500),
    ]);

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

    expect(series.points.map((p) => p.date)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    expect(series.changeAbs).toBe(300);
  });

  it("no calcula el porcentaje si se partía de cero (evita dividir por 0)", () => {
    const series = buildHistorySeries([
      point("2026-01-01", 0, 0),
      point("2026-01-02", 100, 120),
    ]);

    expect(series.changeAbs).toBe(120);
    expect(series.changePct).toBeNull();
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
