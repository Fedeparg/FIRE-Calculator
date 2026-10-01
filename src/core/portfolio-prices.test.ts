import { describe, expect, it } from "vitest";

import {
  isPricePending,
  isStalePrice,
  latestFetchedAt,
  latestPriceDate,
  PENDING_PRICE_WINDOW_MS,
} from "./portfolio-prices";

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

describe("latestFetchedAt", () => {
  it("devuelve el instante de lectura más reciente", () => {
    expect(
      latestFetchedAt({
        IWDA: { fetchedAt: "2026-09-28T09:00:03.000Z" },
        VWCE: { fetchedAt: "2026-09-28T11:00:05.000Z" },
        FUND: { fetchedAt: "2026-09-27T20:30:00.000Z" },
      }),
    ).toBe("2026-09-28T11:00:05.000Z");
  });

  it("ignora los que no lo traen o no se pueden leer", () => {
    expect(latestFetchedAt({ A: {}, B: { fetchedAt: "basura" }, C: undefined })).toBeNull();
    expect(latestFetchedAt({ A: { fetchedAt: "basura" }, B: { fetchedAt: "2026-01-01T00:00:00Z" } })).toBe(
      "2026-01-01T00:00:00Z",
    );
  });

  it("sin precios no hay instante", () => {
    expect(latestFetchedAt({})).toBeNull();
  });
});

describe("isPricePending", () => {
  const created = "2026-10-01T10:00:00.000Z";
  const createdMs = Date.parse(created);
  const position = { isDerivative: false, createdAt: created };

  it("es pendiente justo después del alta si no hay precio", () => {
    expect(isPricePending(position, undefined, createdMs)).toBe(true);
  });

  it("deja de serlo exactamente al cumplirse la ventana", () => {
    const edge = createdMs + PENDING_PRICE_WINDOW_MS;
    expect(isPricePending(position, undefined, edge - 1)).toBe(true);
    expect(isPricePending(position, undefined, edge)).toBe(false);
  });

  it("no es pendiente si ya tiene precio", () => {
    expect(isPricePending(position, { close: 1 }, createdMs)).toBe(false);
  });

  it("los derivados nunca están pendientes", () => {
    expect(isPricePending({ ...position, isDerivative: true }, undefined, createdMs)).toBe(false);
  });

  it("una fecha ilegible no es pendiente", () => {
    expect(isPricePending({ ...position, createdAt: "nope" }, undefined, createdMs)).toBe(false);
  });

  it("una edad negativa (reloj desajustado) cuenta como recién creada", () => {
    expect(isPricePending(position, undefined, createdMs - 5_000)).toBe(true);
  });

  it("admite una ventana personalizada", () => {
    expect(isPricePending(position, undefined, createdMs + 5_000, 1_000)).toBe(false);
  });
});
