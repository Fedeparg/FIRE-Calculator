import { describe, expect, it } from "vitest";
import { defined } from "@sextante/core/assert";

import { fitYDomain } from "./fit-y-domain";

describe("fitYDomain", () => {
  it("ajusta al total apilado con un 1 % de margen", () => {
    const data = [
      { x: 1, a: 100, b: 50 },
      { x: 2, a: 120, b: 80 },
    ];
    expect(fitYDomain(data, ["a", "b"], [])).toEqual([150 - 1.5, 200 + 2]);
  });

  it("incluye las líneas y bandas superpuestas", () => {
    const data = [
      { x: 1, v: 100, low: 90, high: 130 },
      { x: 2, v: 110, low: 95, high: 140 },
    ];
    const [min, max] = defined(fitYDomain(data, ["v"], ["low", "high"]));
    expect(min).toBeCloseTo(90 - 0.9);
    expect(max).toBeCloseTo(140 + 1.4);
  });

  it("abre un margen si todos los valores son iguales, y ±1 si son 0", () => {
    expect(fitYDomain([{ v: 500 }, { v: 500 }], ["v"], [])).toEqual([495, 505]);
    expect(fitYDomain([{ v: 0 }], ["v"], [])).toEqual([-1, 1]);
  });

  it("aplica el margen hacia fuera también con valores negativos", () => {
    expect(fitYDomain([{ v: -100 }, { v: -50 }], ["v"], [])).toEqual([-101, -49.5]);
  });

  it("sin datos o con valores no finitos deja el dominio por defecto", () => {
    expect(fitYDomain([], ["v"], [])).toBeUndefined();
    expect(fitYDomain([{ v: "no es un número" }], ["v"], [])).toBeUndefined();
  });
});
