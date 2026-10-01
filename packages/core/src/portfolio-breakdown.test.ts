import { describe, expect, it } from "vitest";

import { buildBreakdown, type BreakdownInput } from "./portfolio-breakdown.js";

type Position = BreakdownInput["positions"][number];

function position(overrides: Partial<Position> & Pick<Position, "ticker">): Position {
  return {
    name: null,
    quantity: 1,
    broker: null,
    currency: "EUR",
    ...overrides,
  };
}

/** EUR y USD convertibles; GBP deliberadamente ausente para probar la exclusión. */
const RATES = { USD: 1, EUR: 1.1 };

const BASE = {
  rates: RATES,
  display: "EUR",
  unknownBrokerLabel: "Sin bróker",
} as const;

describe("buildBreakdown", () => {
  it("agrupa por activo y calcula el peso de cada uno", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "VWCE", name: "Vanguard All-World", quantity: 10 }),
        position({ ticker: "SXR8", quantity: 10 }),
      ],
      prices: {
        VWCE: { close: 90, currency: "EUR" },
        SXR8: { close: 30, currency: "EUR" },
      },
    });

    expect(result.total).toBe(1200);
    expect(result.slices.map((s) => [s.label, s.value, Math.round(s.share)])).toEqual([
      ["Vanguard All-World", 900, 75],
      ["SXR8", 300, 25],
    ]);
    expect(result.included).toBe(2);
    expect(result.excluded).toBe(0);
  });

  it("usa el ticker como etiqueta cuando la posición no tiene nombre", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [position({ ticker: "AAPL", name: "   " })],
      prices: { AAPL: { close: 100, currency: "EUR" } },
    });

    expect(result.slices[0].label).toBe("AAPL");
  });

  it("suma en un solo grupo el mismo activo en brókeres distintos", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "VWCE", quantity: 5, broker: "MyInvestor" }),
        position({ ticker: "VWCE", quantity: 5, broker: "IBKR" }),
      ],
      prices: { VWCE: { close: 100, currency: "EUR" } },
    });

    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].value).toBe(1000);
    expect(result.slices[0].positions).toBe(2);
  });

  it("agrupa por bróker y etiqueta las posiciones sin bróker", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "broker",
      positions: [
        position({ ticker: "A", quantity: 1, broker: "MyInvestor" }),
        position({ ticker: "B", quantity: 1, broker: "  " }),
      ],
      prices: {
        A: { close: 300, currency: "EUR" },
        B: { close: 100, currency: "EUR" },
      },
    });

    expect(result.slices.map((s) => s.label)).toEqual(["MyInvestor", "Sin bróker"]);
    expect(result.slices[1].value).toBe(100);
  });

  it("agrupa por divisa de la posición, no por la del precio", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "currency",
      // Comprada en EUR pero cotizada en USD: cuenta como EUR.
      positions: [position({ ticker: "AAPL", quantity: 1, currency: "EUR" })],
      prices: { AAPL: { close: 110, currency: "USD" } },
    });

    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].label).toBe("EUR");
    // 110 USD → 100 EUR con rates(EUR) = 1,1 USD/EUR.
    expect(result.slices[0].value).toBeCloseTo(100, 10);
  });

  it("excluye las posiciones sin precio", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [position({ ticker: "A", quantity: 1 }), position({ ticker: "B", quantity: 1 })],
      prices: { A: { close: 100, currency: "EUR" } },
    });

    expect(result.included).toBe(1);
    expect(result.excluded).toBe(1);
    expect(result.total).toBe(100);
  });

  it("excluye las posiciones cuya divisa de precio no es convertible", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [position({ ticker: "A", quantity: 1 }), position({ ticker: "B", quantity: 1 })],
      prices: {
        A: { close: 100, currency: "EUR" },
        // GBP no está en `rates`: no hay forma honesta de convertirlo.
        B: { close: 100, currency: "GBP" },
      },
    });

    expect(result.included).toBe(1);
    expect(result.excluded).toBe(1);
    expect(result.slices).toHaveLength(1);
  });

  it("una cartera sin nada valorable devuelve un reparto vacío, no ceros repartidos", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [position({ ticker: "A" })],
      prices: {},
    });

    expect(result.slices).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.excluded).toBe(1);
  });

  it("los pesos suman 100 % cuando hay algo que repartir", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "A", quantity: 3 }),
        position({ ticker: "B", quantity: 5 }),
        position({ ticker: "C", quantity: 7 }),
      ],
      prices: {
        A: { close: 11, currency: "EUR" },
        B: { close: 13, currency: "EUR" },
        C: { close: 17, currency: "EUR" },
      },
    });

    expect(result.slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(100, 10);
  });

  it("ordena de mayor a menor y desempata por etiqueta", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "Z", quantity: 1 }),
        position({ ticker: "A", quantity: 1 }),
        position({ ticker: "M", quantity: 2 }),
      ],
      prices: {
        Z: { close: 100, currency: "EUR" },
        A: { close: 100, currency: "EUR" },
        M: { close: 100, currency: "EUR" },
      },
    });

    expect(result.slices.map((s) => s.label)).toEqual(["M", "A", "Z"]);
  });

  it("descarta un valor no finito en lugar de contaminar el total", () => {
    const result = buildBreakdown({
      ...BASE,
      groupBy: "asset",
      positions: [
        position({ ticker: "A", quantity: Number.POSITIVE_INFINITY }),
        position({ ticker: "B", quantity: 1 }),
      ],
      prices: {
        A: { close: 100, currency: "EUR" },
        B: { close: 100, currency: "EUR" },
      },
    });

    expect(result.total).toBe(100);
    expect(result.excluded).toBe(1);
  });
});
