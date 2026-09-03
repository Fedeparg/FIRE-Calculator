/**
 * Puente entre la calculadora de independencia financiera y la cartera real: qué patrimonio
 * hace falta (objetivo FIRE), cuánto llevas de verdad y cuánto falta al ritmo de aportación
 * actual. Core puro (sin React), testeable.
 *
 * NO reimplementa nada: el objetivo y el horizonte los calcula `computeFire`, que a su vez
 * delega la acumulación en `project` (`core/projection.ts`). Aquí solo se sustituye el
 * "patrimonio actual" tecleado por el VALOR DE MERCADO real de la cartera y se derivan las
 * cifras de progreso.
 *
 * Divisa: este módulo es agnóstico. Quien llama debe pasar `annualExpenses`, `contribution` y
 * `currentValue` en la MISMA divisa (la elegida en la cartera); los resultados salen en esa.
 */

import { computeFire } from "./calculators/fire";
import type { Frequency } from "./projection";

/**
 * Slug de la calculadora de independencia financiera en `registry.ts`. Identifica los
 * escenarios guardados que comparten la calculadora y este bloque de la cartera: el objetivo
 * se guarda con este slug para que los dos sitios vean exactamente los mismos escenarios.
 */
export const FIRE_CALCULATOR_SLUG = "independencia-financiera";

export interface PortfolioGoalInput {
  /** Gasto anual estimado una vez alcanzada la independencia. */
  annualExpenses: number;
  /** Tasa de retiro segura, en base 100 (4 = regla del 4 %). */
  withdrawalRate: number;
  /** Valor de mercado actual de la cartera (el mismo total que muestra el resumen). */
  currentValue: number;
  /** Aportación por periodo con la que se estima el tiempo restante. */
  contribution: number;
  /** Frecuencia de la aportación. */
  frequency: Frequency;
  /** Rentabilidad anual esperada, en base 100. */
  annualReturn: number;
}

export interface PortfolioGoalResult {
  /** Patrimonio objetivo (número FIRE = gasto anual / tasa de retiro). */
  target: number;
  /** Patrimonio actual usado en la comparación (ya saneado). */
  current: number;
  /**
   * Porcentaje completado (0–100, acotado), o `null` cuando no es representable: sin objetivo
   * positivo la razón "cuánto llevas del objetivo" no significa nada. La interfaz lo pinta
   * como "—" y omite la barra, igual que `format.ts` hace con los valores no finitos.
   */
  progress: number | null;
  /** Lo que falta para el objetivo (0 si ya se ha alcanzado). */
  remaining: number;
  /**
   * Años estimados hasta alcanzarlo manteniendo la aportación, `0` si ya está alcanzado y
   * `null` si no se llega dentro del horizonte que proyecta `computeFire` (60 años).
   */
  yearsToTarget: number | null;
  /** Si el patrimonio actual ya cubre el objetivo. */
  reached: boolean;
}

/**
 * Progreso de la cartera hacia el objetivo de independencia financiera.
 *
 * Casos borde (deliberados, con test):
 * - Gasto anual 0 → objetivo 0: se considera alcanzado, pero `progress` es `null` porque un
 *   porcentaje sobre un objetivo nulo no dice nada.
 * - Tasa de retiro 0 (o negativa) → se hereda el 4 % por defecto de `computeFire`, para que
 *   la calculadora y la cartera den siempre la misma cifra.
 * - Patrimonio actual no finito o negativo → 0. `computeFire` ya sanea el resto de entradas,
 *   así que ningún `NaN` sale de aquí.
 */
export function computePortfolioGoal(input: PortfolioGoalInput): PortfolioGoalResult {
  const current =
    Number.isFinite(input.currentValue) && input.currentValue > 0 ? input.currentValue : 0;

  const fire = computeFire({
    annualExpenses: input.annualExpenses,
    currentSavings: current,
    savings: input.contribution,
    frequency: input.frequency,
    annualReturn: input.annualReturn,
    withdrawalRate: input.withdrawalRate,
  });

  const target = fire.fireNumber;
  const reached = current >= target;
  const progress =
    Number.isFinite(target) && target > 0 ? Math.min(100, (current / target) * 100) : null;

  return {
    target,
    current,
    progress,
    remaining: Math.max(0, target - current),
    // `computeFire` ya devuelve 0 cuando el patrimonio inicial cubre el objetivo; se fuerza
    // igualmente para que "alcanzado" y "0 años" no puedan contradecirse nunca.
    yearsToTarget: reached ? 0 : fire.yearsToFire,
    reached,
  };
}
