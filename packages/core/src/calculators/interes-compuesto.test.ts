import { describe, expect, it } from "vitest";
import { FREQUENCIES } from "../projection.js";
import { computeCompound } from "./interes-compuesto.js";
import { itemAt } from "../arrays.js";

describe("computeCompound", () => {
  it("sin interés (0 %) es la suma exacta de las aportaciones", () => {
    const r = computeCompound({ initial: 1000, contribution: 100, annualRate: 0, years: 10 });
    // 1000 + 100 * 120 meses
    expect(r.finalValue).toBe(13000);
    expect(r.totalContributed).toBe(13000);
    expect(r.totalInterest).toBe(0);
  });

  it("coincide con la fórmula cerrada de la anualidad (tasa anual efectiva, periodo mensual equivalente)", () => {
    const initial = 5000;
    const contribution = 300;
    const annualRate = 7;
    const years = 25;
    // tasa efectiva anual → tasa mensual equivalente (1 + r)^(1/12) − 1
    const i = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
    const n = years * 12;
    const expected = initial * Math.pow(1 + i, n) + contribution * ((Math.pow(1 + i, n) - 1) / i);

    const r = computeCompound({ initial, contribution, annualRate, years });
    expect(r.finalValue).toBeCloseTo(expected, 2);
    expect(r.totalContributed).toBe(initial + contribution * n);
    expect(r.totalInterest).toBeCloseTo(r.finalValue - r.totalContributed, 6);
  });

  it("respeta la frecuencia de aportación (anual aporta 1 vez/año)", () => {
    const r = computeCompound({
      initial: 0,
      contribution: 1200,
      frequency: "annual",
      annualRate: 0,
      years: 10,
    });
    expect(r.totalContributed).toBe(12000); // 1200 * 10
  });

  it("genera un punto por año más el año 0", () => {
    const r = computeCompound({ initial: 0, contribution: 100, annualRate: 5, years: 30 });
    expect(r.series).toHaveLength(31);
    expect(r.series[0]).toEqual({ year: 0, contributed: 0, value: 0, interest: 0, realValue: 0 });
    expect(r.series.at(-1)?.year).toBe(30);
  });

  it("con horizonte 0 devuelve solo el capital inicial", () => {
    const r = computeCompound({ initial: 2500, contribution: 500, annualRate: 8, years: 0 });
    expect(r.finalValue).toBe(2500);
    expect(r.series).toHaveLength(1);
  });

  it("la serie es monótona creciente con aportaciones e interés positivos", () => {
    const r = computeCompound({ initial: 1000, contribution: 200, annualRate: 6, years: 15 });
    for (let k = 1; k < r.series.length; k++) {
      expect(itemAt(r.series, k).value).toBeGreaterThan(itemAt(r.series, k - 1).value);
    }
  });

  it("la comisión anual (TER) reduce la rentabilidad neta", () => {
    const sin = computeCompound({ initial: 10000, contribution: 0, annualRate: 7, years: 20 });
    const con = computeCompound({ initial: 10000, contribution: 0, annualRate: 7, years: 20, annualFee: 1 });
    expect(con.finalValue).toBeLessThan(sin.finalValue);
    // Con comisión, equivale a una rentabilidad neta del 6 %.
    const neto = computeCompound({ initial: 10000, contribution: 0, annualRate: 6, years: 20 });
    expect(con.finalValue).toBeCloseTo(neto.finalValue, 4);
  });

  it("el crecimiento de la aportación aumenta lo aportado", () => {
    const fija = computeCompound({ initial: 0, contribution: 100, frequency: "annual", annualRate: 0, years: 5 });
    const creciente = computeCompound({
      initial: 0,
      contribution: 100,
      frequency: "annual",
      annualRate: 0,
      years: 5,
      contributionGrowth: 10,
    });
    expect(creciente.totalContributed).toBeGreaterThan(fija.totalContributed);
  });

  it("la inflación efectiva anual descuenta el valor real como (1 + i)^años", () => {
    const r = computeCompound({ initial: 10000, contribution: 0, annualRate: 0, years: 10, inflationRate: 3 });
    expect(r.finalValue).toBe(10000);
    expect(r.finalRealValue).toBeCloseTo(10000 / Math.pow(1.03, 10), 4);
  });

  it("si la rentabilidad iguala a la inflación, el valor real se mantiene constante", () => {
    const r = computeCompound({ initial: 5000, contribution: 0, annualRate: 7, years: 30, inflationRate: 7 });
    expect(r.finalValue).toBeGreaterThan(5000); // el nominal sí crece
    expect(r.finalRealValue).toBeCloseTo(5000, 6); // pero el poder adquisitivo, no
    // Y es independiente del horizonte.
    const r10 = computeCompound({ initial: 5000, contribution: 0, annualRate: 7, years: 10, inflationRate: 7 });
    expect(r10.finalRealValue).toBeCloseTo(5000, 6);
  });

  it("sin inflación, el valor real coincide con el nominal", () => {
    const r = computeCompound({ initial: 5000, contribution: 100, annualRate: 5, years: 10 });
    expect(r.finalRealValue).toBeCloseTo(r.finalValue, 6);
  });

  it("trata valores negativos o NaN como cero (robustez de entrada)", () => {
    const r = computeCompound({
      initial: -1000,
      contribution: Number.NaN,
      annualRate: 5,
      years: 10,
    });
    expect(r.finalValue).toBe(0);
    expect(r.totalContributed).toBe(0);
  });

  it("con aportación 0 y 1 año, 10.000 € al 7 % dan 10.700 € con cualquier frecuencia", () => {
    for (const frequency of FREQUENCIES) {
      const r = computeCompound({ initial: 10000, contribution: 0, frequency, annualRate: 7, years: 1 });
      expect(r.finalValue).toBeCloseTo(10700, 8);
    }
  });

  it("la capitalización se elige aparte de la aportación: mensual a tipo nominal 7 % da (1 + 0,07/12)^12", () => {
    for (const frequency of FREQUENCIES) {
      const r = computeCompound({
        initial: 10000,
        contribution: 0,
        frequency,
        compounding: "monthly",
        annualRate: 7,
        years: 1,
      });
      expect(r.finalValue).toBeCloseTo(10000 * Math.pow(1 + 0.07 / 12, 12), 8);
    }
  });
});
