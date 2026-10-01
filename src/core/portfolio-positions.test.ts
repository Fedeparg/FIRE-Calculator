import { describe, expect, it } from "vitest";

import {
  countByFilter,
  matchesQuery,
  positionFilterOf,
  valuePosition,
  type FilterablePosition,
} from "./portfolio-positions";

// USD por unidad: 1 EUR = 1,10 USD.
const RATES = { USD: 1, EUR: 1.1 };

describe("valuePosition", () => {
  it("valora en la divisa de la posición cuando el precio va en la misma", () => {
    expect(valuePosition({ quantity: 10, avgPrice: 80, currency: "EUR" }, { close: 90, currency: "EUR" }, RATES)).toEqual({
      invested: 800,
      marketValue: 900,
      pnlAbs: 100,
      pnlPct: 12.5,
    });
  });

  it("convierte un precio en otra divisa a la de la posición", () => {
    const result = valuePosition({ quantity: 1, avgPrice: 100, currency: "EUR" }, { close: 110, currency: "USD" }, RATES);
    expect(result.marketValue).toBeCloseTo(100, 10);
    expect(result.pnlAbs).toBeCloseTo(0, 10);
  });

  it("deja sin valorar si no hay precio o falta la tasa", () => {
    const position = { quantity: 1, avgPrice: 100, currency: "EUR" };
    expect(valuePosition(position, undefined, RATES)).toEqual({ invested: 100, marketValue: null, pnlAbs: null, pnlPct: null });
    expect(valuePosition(position, { close: 5, currency: "JPY" }, RATES).marketValue).toBeNull();
  });

  it("no da porcentaje sobre una inversión de 0 (p. ej. acciones liberadas)", () => {
    const result = valuePosition({ quantity: 3, avgPrice: 0, currency: "EUR" }, { close: 10, currency: "EUR" }, RATES);
    expect(result.pnlAbs).toBe(30);
    expect(result.pnlPct).toBeNull();
  });
});

const position = (overrides: Partial<FilterablePosition>): FilterablePosition => ({
  ticker: "VWCE.DE",
  name: "Vanguard FTSE All-World",
  broker: "Trade Republic",
  quantity: 10,
  isDerivative: false,
  ...overrides,
});

describe("positionFilterOf / countByFilter", () => {
  it("separa abiertas, cerradas y derivados; un derivado cerrado sigue siendo derivado", () => {
    const list = [
      position({}),
      position({ quantity: 0 }),
      position({ isDerivative: true }),
      position({ isDerivative: true, quantity: 0 }),
    ];
    expect(list.map(positionFilterOf)).toEqual(["open", "closed", "derivatives", "derivatives"]);
    expect(countByFilter(list)).toEqual({ open: 1, closed: 1, derivatives: 2 });
  });

  it("cuenta cero en todos los grupos con la cartera vacía", () => {
    expect(countByFilter([])).toEqual({ open: 0, closed: 0, derivatives: 0 });
  });
});

describe("matchesQuery", () => {
  it("busca en símbolo, nombre y bróker sin distinguir mayúsculas ni acentos", () => {
    const p = position({ broker: "Bróker Ñandú" });
    expect(matchesQuery(p, "vwce")).toBe(true);
    expect(matchesQuery(p, "ALL-WORLD")).toBe(true);
    expect(matchesQuery(p, "broker nandu")).toBe(true);
    expect(matchesQuery(p, "apple")).toBe(false);
  });

  it("una búsqueda vacía o de espacios casa con todo, y los campos nulos no rompen", () => {
    expect(matchesQuery(position({ name: null, broker: null }), "   ")).toBe(true);
    expect(matchesQuery(position({ name: null, broker: null }), "trade")).toBe(false);
  });
});
