import { describe, expect, it } from "vitest";

import { isStalePrice, latestPriceDate } from "./portfolio-prices";

const prices = (dates: Record<string, string>) =>
  Object.fromEntries(Object.entries(dates).map(([ticker, date]) => [ticker, { date }]));

describe("latestPriceDate", () => {
  it("devuelve la fecha más reciente de todas", () => {
    expect(
      latestPriceDate(prices({ IWDA: "2026-03-13", VWCE: "2026-03-15", FUND: "2026-03-10" })),
    ).toBe("2026-03-15");
  });

  it("con un solo precio devuelve su propia fecha", () => {
    expect(latestPriceDate(prices({ IWDA: "2026-03-13" }))).toBe("2026-03-13");
  });

  it("sin precios no hay referencia", () => {
    expect(latestPriceDate({})).toBeNull();
  });

  it("ignora fechas ilegibles en lugar de contaminar el máximo", () => {
    expect(latestPriceDate(prices({ A: "2026-03-13", B: "ayer", C: "2026-3-9" }))).toBe(
      "2026-03-13",
    );
  });

  it("sin ninguna fecha legible no hay referencia", () => {
    expect(latestPriceDate(prices({ A: "", B: "ayer" }))).toBeNull();
  });

  it("tolera huecos del registro (símbolo sin precio)", () => {
    expect(latestPriceDate({ IWDA: undefined, VWCE: { date: "2026-03-15" } })).toBe("2026-03-15");
  });

  it("cruza el cambio de año y de mes comparando como texto", () => {
    expect(latestPriceDate(prices({ A: "2025-12-31", B: "2026-01-01" }))).toBe("2026-01-01");
    expect(latestPriceDate(prices({ A: "2026-01-31", B: "2026-02-01" }))).toBe("2026-02-01");
  });
});

describe("isStalePrice", () => {
  const latest = "2026-03-15";

  it("marca el precio anterior al último refresco", () => {
    expect(isStalePrice({ date: "2026-03-10" }, latest)).toBe(true);
  });

  it("no marca el precio del propio día del refresco", () => {
    expect(isStalePrice({ date: latest }, latest)).toBe(false);
  });

  it("no marca una fila sin precio: eso ya se dice con «—»", () => {
    expect(isStalePrice(undefined, latest)).toBe(false);
  });

  it("sin referencia no marca nada", () => {
    expect(isStalePrice({ date: "2026-03-10" }, null)).toBe(false);
  });

  it("una fecha ilegible no se acusa de vieja", () => {
    expect(isStalePrice({ date: "ayer" }, latest)).toBe(false);
  });

  it("no marca una fecha posterior a la referencia (imposible, pero no se invierte)", () => {
    expect(isStalePrice({ date: "2026-03-20" }, latest)).toBe(false);
  });

  it("con todos los precios igual de viejos no se marca ninguno", () => {
    const all = prices({ A: "2026-03-01", B: "2026-03-01" });
    const reference = latestPriceDate(all);
    expect(Object.values(all).every((p) => !isStalePrice(p, reference))).toBe(true);
  });
});
