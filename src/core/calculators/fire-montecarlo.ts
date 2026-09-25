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

import { computeFire, MAX_YEARS } from "./fire";
import { mulberry32, normalGenerator, percentileSorted } from "../random";

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
  const mean = clamp(Number.isFinite(input.annualReturn) ? input.annualReturn : 0, MIN_RETURN, Infinity) / 100;
  const sigma = clamp(nonNegative(input.volatility), 0, MAX_VOLATILITY) / 100;
  const retirementYears = clamp(Math.round(nonNegative(input.retirementYears)), 0, MAX_RETIREMENT_YEARS);

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

  // Parámetros de la lognormal a partir de la media aritmética y la volatilidad.
  const logVariance = Math.log(1 + (sigma * sigma) / ((1 + mean) * (1 + mean)));
  const logSigma = Math.sqrt(logVariance);
  const logMean = Math.log(1 + mean) - logVariance / 2;

  const horizon = MAX_YEARS + retirementYears;
  // Cada vida consume SIEMPRE el mismo número de rentabilidades (el horizonte máximo), aunque
  // solo se usen `horizon`. Así la vida i ve la misma secuencia de mercado sea cual sea la
  // entrada: cambiar los años de retiro no baraja de nuevo el azar y las comparaciones entre
  // escenarios reflejan el cambio de la entrada, no ruido de muestreo.
  const drawsPerPath = MAX_YEARS + MAX_RETIREMENT_YEARS;
  // wealthByYear[year][path]: se ordena cada año por separado para sacar percentiles.
  const wealthByYear = Array.from({ length: horizon + 1 }, () => new Float64Array(paths));
  const yearsToFire = new Float64Array(paths);

  const normal = normalGenerator(mulberry32(seed));
  let reached = 0;
  let succeeded = 0;

  for (let path = 0; path < paths; path++) {
    const state: PathState = {
      wealth: currentSavings,
      retiredAt: currentSavings >= fireNumber ? 0 : null,
      depletedAt: null,
    };
    wealthByYear[0][path] = state.wealth;
    for (let year = 1; year <= drawsPerPath; year++) {
      const z = normal();
      if (year > horizon) continue;
      // Con σ = 0 se usa la media exacta: exp(log(1+μ)) − 1 no siempre devuelve μ al bit.
      const r = logSigma === 0 ? mean : Math.exp(logMean + logSigma * z) - 1;
      step(state, year, r, params);
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
