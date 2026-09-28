import { describe, expect, it } from "vitest";
import { computeFire } from "./fire";
import {
  HISTORICAL_BLOCK_YEARS,
  simulateFire,
  withdrawalSensitivity,
  type MonteCarloInput,
} from "./fire-montecarlo";
import { HISTORICAL_RETURNS } from "../data/shiller-returns";
import { mulberry32, normalGenerator } from "../random";

// Valores por defecto de la UI (MonteCarloCalculator).
const base: MonteCarloInput = {
  annualExpenses: 24000,
  currentSavings: 20000,
  monthlySavings: 800,
  annualReturn: 5,
  volatility: 15,
  withdrawalRate: 4,
  retirementYears: 40,
};

// Menos vidas en los tests que no miden precisión estadística: más rápidos, igual de deterministas.
const fast = { paths: 1000 };

describe("simulateFire", () => {
  it("número FIRE = gasto / tasa de retiro (regla del 4 % → 25x)", () => {
    expect(simulateFire(base, fast).fireNumber).toBeCloseTo(600_000);
  });

  it("es determinista: misma semilla, mismo resultado", () => {
    const a = simulateFire(base, fast);
    const b = simulateFire(base, fast);
    expect(a).toEqual(b);
  });

  it("semillas distintas dan resultados distintos pero cercanos", () => {
    const a = simulateFire(base, { paths: 3000, seed: 1 });
    const b = simulateFire(base, { paths: 3000, seed: 2 });
    expect(a.successRate).not.toBe(b.successRate);
    expect(Math.abs(a.successRate - b.successRate)).toBeLessThan(0.05);
  });

  it("volatilidad 0: todas las vidas iguales y coincide con la calculadora FIRE anual", () => {
    const result = simulateFire({ ...base, volatility: 0 }, fast);
    const fire = computeFire({
      annualExpenses: 24000,
      currentSavings: 20000,
      savings: 800 * 12,
      frequency: "annual",
      annualReturn: 5,
      withdrawalRate: 4,
    });
    expect(result.yearsToFire.p10).toBe(fire.yearsToFire);
    expect(result.yearsToFire.p50).toBe(fire.yearsToFire);
    expect(result.yearsToFire.p90).toBe(fire.yearsToFire);
    expect(result.deterministicYearsToFire).toBe(fire.yearsToFire);
    // Retirando el 4 % con un 5 % real constante, el dinero no se acaba nunca.
    expect(result.successRate).toBe(1);
    for (const point of result.series) {
      expect(point.p10).toBeCloseTo(point.deterministic, 6);
      expect(point.p90).toBeCloseTo(point.deterministic, 6);
    }
  });

  it("volatilidad 0 con retiro insostenible → éxito 0 %", () => {
    // Tasa de retiro del 10 % con rentabilidad 0: el dinero dura 10 años, no 40.
    const result = simulateFire({ ...base, volatility: 0, annualReturn: 0, withdrawalRate: 10 }, fast);
    expect(result.reachRate).toBe(1);
    expect(result.successRate).toBe(0);
    expect(result.survivalRate).toBe(0);
  });

  it("gasto 0: ya eres libre (año 0) y el éxito es del 100 %", () => {
    const result = simulateFire({ ...base, annualExpenses: 0 }, fast);
    expect(result.fireNumber).toBe(0);
    expect(result.yearsToFire).toEqual({ p10: 0, p50: 0, p90: 0 });
    expect(result.successRate).toBe(1);
  });

  it("patrimonio ≥ número FIRE: se retira en el año 0", () => {
    const result = simulateFire({ ...base, currentSavings: 1_000_000 }, fast);
    expect(result.reachRate).toBe(1);
    expect(result.yearsToFire.p50).toBe(0);
  });

  it("sin ahorro ni rentabilidad nunca se llega: años null y éxito 0 %", () => {
    const result = simulateFire(
      { ...base, monthlySavings: 0, annualReturn: 0, volatility: 0 },
      fast,
    );
    expect(result.reachRate).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.survivalRate).toBeNaN();
    expect(result.yearsToFire).toEqual({ p10: null, p50: null, p90: null });
    expect(result.deterministicYearsToFire).toBeNull();
  });

  it("0 años de retiro: toda vida que llega cuenta como éxito", () => {
    const result = simulateFire({ ...base, retirementYears: 0 }, fast);
    expect(result.successRate).toBe(result.reachRate);
    expect(result.survivalRate).toBe(1);
  });

  it("sanea entradas no finitas o negativas", () => {
    const result = simulateFire(
      {
        annualExpenses: Number.NaN,
        currentSavings: -5000,
        monthlySavings: Number.POSITIVE_INFINITY,
        annualReturn: Number.NaN,
        volatility: -10,
        withdrawalRate: 0,
        retirementYears: Number.NaN,
      },
      fast,
    );
    expect(result.fireNumber).toBe(0);
    expect(result.successRate).toBe(1);
    for (const point of result.series) {
      for (const key of ["p10", "p50", "p90", "deterministic"] as const) {
        expect(Number.isFinite(point[key])).toBe(true);
      }
    }
  });

  it("volatilidad extrema: sin valores negativos ni no finitos", () => {
    const result = simulateFire({ ...base, volatility: 500 }, fast);
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
    for (const point of result.series) {
      expect(point.p10).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(point.p90)).toBe(true);
    }
  });

  it("más volatilidad → menor probabilidad de éxito", () => {
    const calm = simulateFire({ ...base, volatility: 5 });
    const wild = simulateFire({ ...base, volatility: 25 });
    expect(wild.successRate).toBeLessThan(calm.successRate);
  });

  it("más años de retiro → menor (o igual) probabilidad de éxito", () => {
    const short = simulateFire({ ...base, retirementYears: 20 });
    const long = simulateFire({ ...base, retirementYears: 50 });
    expect(long.successRate).toBeLessThanOrEqual(short.successRate);
    expect(long.reachRate).toBe(short.reachRate);
  });

  it("los percentiles del patrimonio están ordenados cada año", () => {
    for (const p of simulateFire(base, fast).series) {
      expect(p.p10).toBeLessThanOrEqual(p.p25);
      expect(p.p25).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p75);
      expect(p.p75).toBeLessThanOrEqual(p.p90);
      expect(p.target).toBe(600_000);
    }
  });

  it("la gráfica llega hasta el año FIRE mediano más los años de retiro", () => {
    const result = simulateFire(base, fast);
    const last = result.series.at(-1);
    expect(last?.year).toBe((result.yearsToFire.p50 ?? 0) + base.retirementYears);
  });

  it("la lognormal respeta la media aritmética: E[1 + r] ≈ 1 + μ", () => {
    // Misma parametrización que el simulador, comprobada de forma independiente.
    const mu = 0.05;
    const sigma = 0.15;
    const v = Math.log(1 + (sigma * sigma) / ((1 + mu) * (1 + mu)));
    const m = Math.log(1 + mu) - v / 2;
    const normal = normalGenerator(mulberry32(3));
    const n = 200_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.exp(m + Math.sqrt(v) * normal()) - 1;
      expect(r).toBeGreaterThan(-1);
      sum += r;
      sumSq += r * r;
    }
    const mean = sum / n;
    expect(mean).toBeCloseTo(mu, 2);
    expect(Math.sqrt(sumSq / n - mean * mean)).toBeCloseTo(sigma, 2);
  });

  it("valor de referencia con los valores por defecto (semilla fija)", () => {
    const result = simulateFire(base);
    // 28 y no 27 como en la calculadora FIRE: aquí el ahorro se aporta una vez al año.
    expect(result.deterministicYearsToFire).toBe(28);
    expect(result.yearsToFire).toMatchInlineSnapshot(`
      {
        "p10": 21,
        "p50": 29,
        "p90": 41,
      }
    `);
    expect(Math.round(result.successRate * 1000) / 1000).toMatchInlineSnapshot(`0.709`);
    expect(Math.round(result.reachRate * 1000) / 1000).toMatchInlineSnapshot(`0.993`);
  });
});

describe("simulateFire — modelo histórico", () => {
  const historical = (stockShare: number): MonteCarloInput => ({
    ...base,
    returnModel: { kind: "historical", stockShare },
  });

  it("es determinista con la misma semilla", () => {
    expect(simulateFire(historical(60), fast)).toEqual(simulateFire(historical(60), fast));
  });

  it("ignora la rentabilidad y la volatilidad tecleadas", () => {
    const a = simulateFire(historical(60), fast);
    const b = simulateFire({ ...historical(60), annualReturn: 12, volatility: 40 }, fast);
    expect(b).toEqual(a);
  });

  it("la referencia determinista usa la media histórica de la mezcla", () => {
    const stocks = HISTORICAL_RETURNS.reduce((sum, y) => sum + y.stocks, 0) / HISTORICAL_RETURNS.length;
    const result = simulateFire(historical(100), fast);
    const expected = computeFire({
      annualExpenses: base.annualExpenses,
      currentSavings: base.currentSavings,
      savings: base.monthlySavings * 12,
      frequency: "annual",
      annualReturn: stocks * 100,
      withdrawalRate: base.withdrawalRate,
    });
    expect(result.deterministicYearsToFire).toBe(expected.yearsToFire);
  });

  it("100 % acciones llega antes que 100 % bonos", () => {
    const stocks = simulateFire(historical(100), fast);
    const bonds = simulateFire(historical(0), fast);
    expect(stocks.yearsToFire.p50 ?? Infinity).toBeLessThan(bonds.yearsToFire.p50 ?? Infinity);
    expect(stocks.reachRate).toBeGreaterThanOrEqual(bonds.reachRate);
  });

  it("acota el porcentaje en acciones a 0–100 y trata lo no finito como 0", () => {
    expect(simulateFire(historical(150), fast)).toEqual(simulateFire(historical(100), fast));
    expect(simulateFire(historical(-20), fast)).toEqual(simulateFire(historical(0), fast));
    expect(simulateFire(historical(Number.NaN), fast)).toEqual(simulateFire(historical(0), fast));
  });

  it("los bloques recorren años consecutivos de la serie", () => {
    // Con un solo camino y sin ahorro ni gasto, la riqueza año a año revela las rentabilidades:
    // dentro de cada bloque tienen que ser años históricos consecutivos.
    const result = simulateFire(
      { ...historical(100), annualExpenses: 1e12, currentSavings: 1, monthlySavings: 0, retirementYears: 0 },
      { paths: 1 },
    );
    const returns = result.series.slice(1).map((p, i) => p.p50 / result.series[i].p50 - 1);
    const index = HISTORICAL_RETURNS.findIndex((y) => Math.abs(y.stocks - returns[0]) < 1e-12);
    expect(index).toBeGreaterThanOrEqual(0);
    for (let k = 1; k < HISTORICAL_BLOCK_YEARS; k++) {
      const expected = HISTORICAL_RETURNS[(index + k) % HISTORICAL_RETURNS.length].stocks;
      expect(returns[k]).toBeCloseTo(expected, 12);
    }
  });

  it("no produce valores no finitos", () => {
    const result = simulateFire(historical(60), fast);
    for (const point of result.series) {
      for (const key of ["p10", "p25", "p50", "p75", "p90", "deterministic"] as const) {
        expect(Number.isFinite(point[key])).toBe(true);
      }
    }
  });
});

describe("withdrawalSensitivity", () => {
  it("devuelve una fila por tasa, con su número FIRE", () => {
    const rows = withdrawalSensitivity(base, [3, 4, 5], fast);
    expect(rows.map((r) => r.rate)).toEqual([3, 4, 5]);
    expect(rows[0].fireNumber).toBeCloseTo(800_000);
    expect(rows[1].fireNumber).toBeCloseTo(600_000);
  });

  it("cada fila coincide con simular esa tasa por separado", () => {
    const [row] = withdrawalSensitivity(base, [3.5], fast);
    expect(row.successRate).toBe(simulateFire({ ...base, withdrawalRate: 3.5 }, fast).successRate);
  });

  it("con un retiro largo, retirar más reduce la probabilidad de éxito", () => {
    const rows = withdrawalSensitivity({ ...base, retirementYears: 50 }, [3, 4, 5, 6], fast);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].successRate).toBeLessThanOrEqual(rows[i - 1].successRate);
    }
  });

  it("funciona también con el modelo histórico", () => {
    const rows = withdrawalSensitivity({ ...base, returnModel: { kind: "historical", stockShare: 60 } }, undefined, fast);
    expect(rows).toHaveLength(5);
    rows.forEach((r) => {
      expect(r.successRate).toBeGreaterThanOrEqual(0);
      expect(r.successRate).toBeLessThanOrEqual(1);
    });
  });
});
