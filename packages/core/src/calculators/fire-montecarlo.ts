// Simulador FIRE Monte Carlo. Cada vida sigue una secuencia aleatoria de rentabilidades anuales
// y el resultado es una probabilidad, no una fecha única. Dos fases en términos reales y pasos anuales:
//   1. Acumulación: W = W·(1+r) + ahorro, hasta el número FIRE (como mucho `MAX_YEARS`).
//   2. Retiro: se retira el gasto al principio de cada año, W = (W − gasto)·(1+r); si no llega
//      dentro de `retirementYears`, la vida fracasa.
//
// Lognormal: 1 + r = exp(m + s·Z), Z ~ N(0, 1), con E[1 + r] = 1 + μ y desviación σ; nunca pierde
// más del 100 %. Con σ = 0 coincide con la calculadora FIRE en frecuencia anual.
//
// Histórico (opcional): bootstrap circular por bloques de `HISTORICAL_BLOCK_YEARS` años reales de EE. UU.
// (Shiller); los bloques conservan rachas (1929-1932, 1973-1974…) y con ellas el riesgo de secuencia.
// La mezcla acciones/bonos se rebalancea cada año.

import { computeFire, MAX_YEARS } from "./fire.js";
import { HISTORICAL_RETURNS } from "../data/shiller-returns.js";
import { mulberry32, normalGenerator, percentileSorted, type Rng } from "../random.js";

/**
 * Cómo se generan las rentabilidades. `lognormal`: media `annualReturn` y volatilidad `volatility`
 * (por defecto). `historical`: años reales remuestreados; `stockShare` es el % en acciones (base 100),
 * el resto bonos, e ignora `annualReturn` y `volatility`.
 */
export type ReturnModel = { kind: "lognormal" } | { kind: "historical"; stockShare: number };

export interface MonteCarloInput {
  annualExpenses: number;
  currentSavings: number;
  /** Ahorro mensual hasta FIRE; se aporta sumado a final de cada año. */
  monthlySavings: number;
  annualReturn: number;
  volatility: number;
  withdrawalRate: number;
  retirementYears: number;
  returnModel?: ReturnModel;
}

export interface MonteCarloOptions {
  paths?: number;
  /** Semilla: la misma da siempre el mismo resultado. */
  seed?: number;
}

export interface YearsPercentiles {
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

export interface MonteCarloPoint {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  deterministic: number;
  target: number;
  [key: string]: number;
}

export interface MonteCarloResult {
  fireNumber: number;
  successRate: number;
  reachRate: number;
  survivalRate: number;
  yearsToFire: YearsPercentiles;
  deterministicYearsToFire: number | null;
  series: MonteCarloPoint[];
}

export const DEFAULT_PATHS = 5000;
export const DEFAULT_SEED = 42;
export const MAX_RETIREMENT_YEARS = 60;
export const MAX_VOLATILITY = 100;
/** Suelo de la rentabilidad media, base 100 (1 + μ debe ser positivo). */
const MIN_RETURN = -99;
export const HISTORICAL_BLOCK_YEARS = 10;
export const SENSITIVITY_RATES: readonly number[] = [3, 3.5, 4, 4.5, 5];

const nonNegative = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface PathState {
  wealth: number;
  retiredAt: number | null;
  depletedAt: number | null;
}

/** Avanza una vida un año con rentabilidad `r` (muta `state`); la comparten las vidas aleatorias y la determinista para seguir las mismas reglas. */
function step(
  state: PathState,
  year: number,
  r: number,
  params: { annualSavings: number; annualExpenses: number; fireNumber: number },
): void {
  if (state.retiredAt === null) {
    state.wealth = state.wealth * (1 + r) + params.annualSavings;
    if (year <= MAX_YEARS && state.wealth >= params.fireNumber) state.retiredAt = year;
    return;
  }
  if (state.depletedAt !== null) return;
  if (state.wealth < params.annualExpenses) {
    state.wealth = 0;
    state.depletedAt = year;
    return;
  }
  state.wealth = (state.wealth - params.annualExpenses) * (1 + r);
}

export function simulateFire(input: MonteCarloInput, options: MonteCarloOptions = {}): MonteCarloResult {
  const paths = Math.max(1, Math.round(options.paths ?? DEFAULT_PATHS));
  const seed = options.seed ?? DEFAULT_SEED;

  const annualExpenses = nonNegative(input.annualExpenses);
  const currentSavings = nonNegative(input.currentSavings);
  const annualSavings = nonNegative(input.monthlySavings) * 12;
  const retirementYears = clamp(Math.round(nonNegative(input.retirementYears)), 0, MAX_RETIREMENT_YEARS);

  const model = input.returnModel ?? { kind: "lognormal" };
  const historical = model.kind === "historical" ? blendHistorical(model.stockShare) : null;
  // Media: la tecleada en lognormal, la histórica de la mezcla en histórico; la usa la referencia determinista.
  const mean = historical
    ? historical.mean
    : clamp(Number.isFinite(input.annualReturn) ? input.annualReturn : 0, MIN_RETURN, Infinity) / 100;
  const sigma = clamp(nonNegative(input.volatility), 0, MAX_VOLATILITY) / 100;

  // FIRE en frecuencia anual para que las reglas de aportación coincidan con las de este simulador
  const fire = computeFire({
    annualExpenses,
    currentSavings,
    savings: annualSavings,
    frequency: "annual",
    annualReturn: mean * 100,
    withdrawalRate: input.withdrawalRate,
  });
  const fireNumber = fire.fireNumber;
  const params = { annualSavings, annualExpenses, fireNumber };

  const horizon = MAX_YEARS + retirementYears;
  // cada vida consume siempre el mismo número de rentabilidades: cambiar los años de retiro no baraja el azar y los escenarios son comparables
  const drawsPerPath = MAX_YEARS + MAX_RETIREMENT_YEARS;
  const returns = new Float64Array(drawsPerPath);
  const drawPath = historical
    ? historicalSampler(historical.returns, mulberry32(seed))
    : lognormalSampler(mean, sigma, mulberry32(seed));
  // wealthByYear[year][path]: se ordena cada año para sacar percentiles
  const wealthByYear = Array.from({ length: horizon + 1 }, () => new Float64Array(paths));
  const yearsToFire = new Float64Array(paths);

  let reached = 0;
  let succeeded = 0;

  for (let path = 0; path < paths; path++) {
    const state: PathState = {
      wealth: currentSavings,
      retiredAt: currentSavings >= fireNumber ? 0 : null,
      depletedAt: null,
    };
    wealthByYear[0][path] = state.wealth;
    drawPath(returns);
    for (let year = 1; year <= horizon; year++) {
      step(state, year, returns[year - 1], params);
      wealthByYear[year][path] = state.wealth;
    }

    yearsToFire[path] = state.retiredAt ?? Infinity;
    if (state.retiredAt !== null) {
      reached++;
      const survived = state.depletedAt === null || state.depletedAt > state.retiredAt + retirementYears;
      if (survived) succeeded++;
    }
  }

  // determinista: mismas reglas con rentabilidad constante
  const reference: PathState = {
    wealth: currentSavings,
    retiredAt: currentSavings >= fireNumber ? 0 : null,
    depletedAt: null,
  };
  const deterministicByYear = [reference.wealth];
  for (let year = 1; year <= horizon; year++) {
    step(reference, year, mean, params);
    deterministicByYear.push(reference.wealth);
  }

  yearsToFire.sort();
  const yearsAt = (p: number): number | null => {
    const value = percentileSorted(yearsToFire, p);
    return Number.isFinite(value) ? Math.round(value) : null;
  };
  const yearsPercentiles: YearsPercentiles = { p10: yearsAt(10), p50: yearsAt(50), p90: yearsAt(90) };

  // la gráfica cubre la vida mediana: hasta que llega más los años de retiro
  const chartEnd = Math.min(horizon, (yearsPercentiles.p50 ?? MAX_YEARS) + retirementYears);
  const series: MonteCarloPoint[] = [];
  for (let year = 0; year <= chartEnd; year++) {
    const sorted = wealthByYear[year].sort();
    series.push({
      year,
      p10: percentileSorted(sorted, 10),
      p25: percentileSorted(sorted, 25),
      p50: percentileSorted(sorted, 50),
      p75: percentileSorted(sorted, 75),
      p90: percentileSorted(sorted, 90),
      deterministic: deterministicByYear[year],
      target: fireNumber,
    });
  }

  return {
    fireNumber,
    successRate: succeeded / paths,
    reachRate: reached / paths,
    survivalRate: reached === 0 ? NaN : succeeded / reached,
    yearsToFire: yearsPercentiles,
    deterministicYearsToFire: fire.yearsToFire,
    series,
  };
}

/** Secuencia lognormal de una vida; consume siempre `out.length` normales para que la vida i vea el mismo mercado (ver `drawsPerPath`). */
function lognormalSampler(mean: number, sigma: number, rng: Rng): (out: Float64Array) => void {
  // parámetros de la lognormal desde la media aritmética y la volatilidad
  const logVariance = Math.log(1 + (sigma * sigma) / ((1 + mean) * (1 + mean)));
  const logSigma = Math.sqrt(logVariance);
  const logMean = Math.log(1 + mean) - logVariance / 2;
  const normal = normalGenerator(rng);
  return (out) => {
    for (let i = 0; i < out.length; i++) {
      const z = normal();
      // con σ = 0 se usa la media exacta: exp(log(1+μ)) − 1 no siempre devuelve μ al bit
      out[i] = logSigma === 0 ? mean : Math.exp(logMean + logSigma * z) - 1;
    }
  };
}

/** Bootstrap circular por bloques: cada tramo empieza en un año al azar y sigue en orden. Consume un aleatorio por bloque, por la misma razón que el lognormal. */
function historicalSampler(series: readonly number[], rng: Rng): (out: Float64Array) => void {
  const n = series.length;
  return (out) => {
    for (let i = 0; i < out.length; i += HISTORICAL_BLOCK_YEARS) {
      const start = Math.floor(rng() * n);
      const end = Math.min(out.length, i + HISTORICAL_BLOCK_YEARS);
      for (let k = i; k < end; k++) out[k] = series[(start + k - i) % n];
    }
  };
}

/** Serie histórica con `stockShare` % en acciones y el resto en bonos, rebalanceada cada año, y su media; porcentaje no finito = 0, acotado a 0–100. */
function blendHistorical(stockShare: number): { returns: number[]; mean: number } {
  const share = clamp(Number.isFinite(stockShare) ? stockShare : 0, 0, 100) / 100;
  const returns = HISTORICAL_RETURNS.map((y) => share * y.stocks + (1 - share) * y.bonds);
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  return { returns, mean };
}

export interface SensitivityRow {
  rate: number;
  fireNumber: number;
  successRate: number;
}

/**
 * Probabilidad de éxito para varias tasas de retiro. Misma semilla en todas las filas: las diferencias
 * se deben a la tasa, no al azar (tasa alta: objetivo menor pero más exigencia en el retiro).
 */
export function withdrawalSensitivity(
  input: MonteCarloInput,
  rates: readonly number[] = SENSITIVITY_RATES,
  options: MonteCarloOptions = {},
): SensitivityRow[] {
  return rates.map((rate) => {
    const result = simulateFire({ ...input, withdrawalRate: rate }, options);
    return { rate, fireNumber: result.fireNumber, successRate: result.successRate };
  });
}
