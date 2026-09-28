// Simulador FIRE Monte Carlo. Frente a la calculadora FIRE (core/calculators/fire.ts), que
// supone la misma rentabilidad todos los años, aquí cada simulación sigue una secuencia
// aleatoria de rentabilidades anuales con la media y la volatilidad indicadas, y el resultado
// es una probabilidad en lugar de una única fecha.
//
// Cada vida tiene dos fases, en términos reales (euros de hoy) y en pasos anuales:
//   1. Acumulación: W = W·(1+r) + ahorro anual, hasta alcanzar el número FIRE
//      (como mucho `MAX_YEARS` años, el mismo horizonte que la calculadora FIRE).
//   2. Retiro: se retira el gasto anual al principio de cada año, W = (W − gasto)·(1+r).
//      Si no llega para pagar un año completo dentro de `retirementYears`, la vida fracasa.
//
// Las rentabilidades siguen una lognormal: 1 + r = exp(m + s·Z), con Z ~ N(0, 1). Se eligen
// m y s para que E[1 + r] = 1 + μ y la desviación típica de r sea σ. A diferencia de una
// normal, nunca produce pérdidas de más del 100 %. Con σ = 0 degenera en r = μ todos los años,
// y el simulador coincide exactamente con la calculadora FIRE en frecuencia anual.
//
// Modelo histórico (opcional): en lugar de sortear rentabilidades de una distribución, se
// reutilizan años REALES del mercado de EE. UU. (datos de Shiller, `core/data/shiller-returns.ts`)
// con un bootstrap circular por bloques: cada vida encadena tramos de `HISTORICAL_BLOCK_YEARS`
// años consecutivos que empiezan en un año al azar (dando la vuelta al final de la serie). Los
// bloques conservan las rachas (1929-1932, 1973-1974, 2000-2002…) que un sorteo año a año
// rompería, y con ellas el riesgo de secuencia. La mezcla acciones/bonos se rebalancea cada año.

import { computeFire, MAX_YEARS } from "./fire";
import { HISTORICAL_RETURNS } from "../data/shiller-returns";
import { mulberry32, normalGenerator, percentileSorted, type Rng } from "../random";

/**
 * Cómo se generan las rentabilidades anuales.
 * - `lognormal`: media `annualReturn` y volatilidad `volatility` (el modelo por defecto).
 * - `historical`: años reales remuestreados por bloques; `stockShare` es el porcentaje en
 *   acciones (base 100), el resto en bonos. Ignora `annualReturn` y `volatility`.
 */
export type ReturnModel = { kind: "lognormal" } | { kind: "historical"; stockShare: number };

export interface MonteCarloInput {
  /** Gasto anual deseado una vez retirado (y el que se retira cada año). */
  annualExpenses: number;
  /** Patrimonio invertido actual. */
  currentSavings: number;
  /** Ahorro mensual hasta alcanzar FIRE. Se aporta sumado a final de cada año. */
  monthlySavings: number;
  /** Rentabilidad anual real esperada (media aritmética), en base 100 (5 = 5 %). */
  annualReturn: number;
  /** Volatilidad anual (desviación típica de la rentabilidad), en base 100 (15 = 15 %). */
  volatility: number;
  /** Tasa de retiro segura, en base 100 (4 = 4 %). Define el número FIRE. */
  withdrawalRate: number;
  /** Años que el patrimonio debe sostener el gasto una vez retirado. */
  retirementYears: number;
  /** Modelo de rentabilidades. Si falta, lognormal. */
  returnModel?: ReturnModel;
}

export interface MonteCarloOptions {
  /** Número de vidas simuladas. */
  paths?: number;
  /** Semilla del generador aleatorio: la misma semilla da siempre el mismo resultado. */
  seed?: number;
}

/** Percentiles de la distribución de años hasta FIRE; null si en ese percentil no se llega. */
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
  /** Trayectoria sin volatilidad (rentabilidad constante = media), como referencia. */
  deterministic: number;
  /** Número FIRE (constante). */
  target: number;
  [key: string]: number;
}

export interface MonteCarloResult {
  fireNumber: number;
  /** Fracción (0–1) de vidas que llegan a FIRE y no se quedan sin dinero. */
  successRate: number;
  /** Fracción (0–1) de vidas que alcanzan el número FIRE dentro del horizonte. */
  reachRate: number;
  /** Fracción (0–1) de las vidas que llegan que además sostienen el retiro. NaN si ninguna llega. */
  survivalRate: number;
  /** Años hasta FIRE en los percentiles 10, 50 y 90 de todas las vidas. */
  yearsToFire: YearsPercentiles;
  /** Años hasta FIRE sin volatilidad (calculadora FIRE en frecuencia anual). */
  deterministicYearsToFire: number | null;
  /** Patrimonio por año: percentiles de todas las vidas, referencia determinista y objetivo. */
  series: MonteCarloPoint[];
}

export const DEFAULT_PATHS = 5000;
export const DEFAULT_SEED = 42;
/** Tope de años de retiro (y del horizonte total de la gráfica). */
export const MAX_RETIREMENT_YEARS = 60;
/** Tope de volatilidad, en base 100: por encima el modelo deja de tener sentido. */
export const MAX_VOLATILITY = 100;
/** Suelo de la rentabilidad media, en base 100: 1 + μ tiene que ser positivo. */
const MIN_RETURN = -99;
/** Longitud de los bloques del bootstrap histórico, en años. */
export const HISTORICAL_BLOCK_YEARS = 10;
/** Tasas de retiro (base 100) de la tabla de sensibilidad por defecto. */
export const SENSITIVITY_RATES: readonly number[] = [3, 3.5, 4, 4.5, 5];

/** Número finito y no negativo; cualquier otra cosa (NaN, ±∞, negativo) es 0. */
const nonNegative = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface PathState {
  wealth: number;
  /** Año en que alcanza el número FIRE, o null si aún no. */
  retiredAt: number | null;
  /** Año en que se queda sin dinero, o null si no le ha pasado. */
  depletedAt: number | null;
}

/**
 * Avanza una vida un año con la rentabilidad `r`. Muta `state`. Compartida por las vidas
 * aleatorias y por la trayectoria determinista, para que ambas sigan exactamente las mismas reglas.
 */
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

export function simulateFire(
  input: MonteCarloInput,
  options: MonteCarloOptions = {},
): MonteCarloResult {
  const paths = Math.max(1, Math.round(options.paths ?? DEFAULT_PATHS));
  const seed = options.seed ?? DEFAULT_SEED;

  const annualExpenses = nonNegative(input.annualExpenses);
  const currentSavings = nonNegative(input.currentSavings);
  const annualSavings = nonNegative(input.monthlySavings) * 12;
  const retirementYears = clamp(Math.round(nonNegative(input.retirementYears)), 0, MAX_RETIREMENT_YEARS);

  const model = input.returnModel ?? { kind: "lognormal" };
  const historical = model.kind === "historical" ? blendHistorical(model.stockShare) : null;
  // Rentabilidad media: la tecleada en el modelo lognormal; la media histórica de la mezcla en el
  // histórico. Es la que usan el número de años determinista y la trayectoria de referencia.
  const mean = historical
    ? historical.mean
    : clamp(Number.isFinite(input.annualReturn) ? input.annualReturn : 0, MIN_RETURN, Infinity) / 100;
  const sigma = clamp(nonNegative(input.volatility), 0, MAX_VOLATILITY) / 100;

  // El número FIRE y la referencia sin volatilidad salen de la calculadora FIRE, en frecuencia
  // anual para que las reglas de aportación coincidan con las de este simulador.
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
  // Cada vida consume SIEMPRE el mismo número de rentabilidades (el horizonte máximo), aunque
  // solo se usen `horizon`. Así la vida i ve la misma secuencia de mercado sea cual sea la
  // entrada: cambiar los años de retiro no baraja de nuevo el azar y las comparaciones entre
  // escenarios reflejan el cambio de la entrada, no ruido de muestreo.
  const drawsPerPath = MAX_YEARS + MAX_RETIREMENT_YEARS;
  const returns = new Float64Array(drawsPerPath);
  const drawPath = historical
    ? historicalSampler(historical.returns, mulberry32(seed))
    : lognormalSampler(mean, sigma, mulberry32(seed));
  // wealthByYear[year][path]: se ordena cada año por separado para sacar percentiles.
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
      const survived =
        state.depletedAt === null || state.depletedAt > state.retiredAt + retirementYears;
      if (survived) succeeded++;
    }
  }

  // Trayectoria determinista: mismas reglas, rentabilidad constante igual a la media.
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

  // La gráfica cubre la vida de la simulación mediana: hasta que llega y los años de retiro.
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

/**
 * Generador de la secuencia lognormal de una vida: rellena `out` con una rentabilidad por año.
 * Consume exactamente `out.length` normales por vida, en orden, para que la vida i vea siempre
 * la misma secuencia de mercado (ver `drawsPerPath`).
 */
function lognormalSampler(mean: number, sigma: number, rng: Rng): (out: Float64Array) => void {
  // Parámetros de la lognormal a partir de la media aritmética y la volatilidad.
  const logVariance = Math.log(1 + (sigma * sigma) / ((1 + mean) * (1 + mean)));
  const logSigma = Math.sqrt(logVariance);
  const logMean = Math.log(1 + mean) - logVariance / 2;
  const normal = normalGenerator(rng);
  return (out) => {
    for (let i = 0; i < out.length; i++) {
      const z = normal();
      // Con σ = 0 se usa la media exacta: exp(log(1+μ)) − 1 no siempre devuelve μ al bit.
      out[i] = logSigma === 0 ? mean : Math.exp(logMean + logSigma * z) - 1;
    }
  };
}

/**
 * Generador del bootstrap circular por bloques: cada tramo de `HISTORICAL_BLOCK_YEARS` años
 * empieza en un año histórico al azar y sigue en orden, dando la vuelta al final de la serie.
 * Consume un número fijo de aleatorios por vida (un inicio por bloque), por la misma razón que
 * el modelo lognormal.
 */
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

/**
 * Serie histórica de una cartera con `stockShare` % en acciones y el resto en bonos, rebalanceada
 * cada año, y su media aritmética. Un porcentaje no finito cuenta como 0; se acota a 0–100.
 */
function blendHistorical(stockShare: number): { returns: number[]; mean: number } {
  const share = clamp(Number.isFinite(stockShare) ? stockShare : 0, 0, 100) / 100;
  const returns = HISTORICAL_RETURNS.map((y) => share * y.stocks + (1 - share) * y.bonds);
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  return { returns, mean };
}

export interface SensitivityRow {
  /** Tasa de retiro, en base 100. */
  rate: number;
  /** Número FIRE con esa tasa. */
  fireNumber: number;
  /** Fracción (0–1) de vidas que llegan y sostienen el retiro con esa tasa. */
  successRate: number;
}

/**
 * Probabilidad de éxito para varias tasas de retiro con el resto de la entrada fija. Todas las
 * filas usan la misma semilla, y por tanto las mismas secuencias de mercado: las diferencias entre
 * filas se deben a la tasa, no al azar. Una tasa más alta baja el objetivo (se llega antes) pero
 * exige más a la cartera durante el retiro; la tabla enseña ese intercambio.
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
