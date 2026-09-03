// Núcleo fiscal compartido: escalas oficiales y motor de tramos progresivos.
// Core puro (sin React). ÚNICA fuente de verdad de los tipos impositivos usados
// por las calculadoras fiscales.
//
// IMPORTANTE: todas las cifras son ORIENTATIVAS. Las escalas autonómicas pueden
// diferir de la estatal/supletoria. Revisadas con fuentes oficiales (AEAT, BOE)
// para el ejercicio indicado en `FISCAL_YEAR`.

/** Ejercicio fiscal de referencia de las escalas de este módulo. */
export const FISCAL_YEAR = 2026;

/**
 * `FISCAL_YEAR` en texto, para inyectarlo como argumento `{year}` en los avisos
 * traducidos de las calculadoras fiscales. Se pasa como cadena a propósito: así
 * el año nunca queda sujeto al formateo numérico del idioma, que le añadiría
 * separador de millares («2.026»).
 */
export const FISCAL_YEAR_LABEL = String(FISCAL_YEAR);

/**
 * Un tramo de una escala progresiva.
 * - `upTo`: límite superior de la base para este tramo (incluido). `null` = sin
 *   límite (último tramo).
 * - `rate`: tipo marginal aplicable al tramo, en base 100 (19 = 19 %).
 */
export interface Bracket {
  readonly upTo: number | null;
  readonly rate: number;
}

/**
 * Aplica una escala progresiva por tramos a una base imponible y devuelve la
 * cuota resultante. Cada tramo grava solo la porción de base que cae dentro de
 * él (no toda la base al tipo más alto).
 */
export function applyProgressiveBrackets(base: number, brackets: readonly Bracket[]): number {
  const b = Math.max(0, Number.isFinite(base) ? base : 0);
  let tax = 0;
  let lower = 0;

  for (const bracket of brackets) {
    const upper = bracket.upTo ?? Infinity;
    if (b <= lower) break;
    const taxable = Math.min(b, upper) - lower;
    if (taxable > 0) tax += taxable * (bracket.rate / 100);
    lower = upper;
  }

  return tax;
}

/** Tipo marginal (%) aplicable al último euro de la base dada. */
export function marginalRate(base: number, brackets: readonly Bracket[]): number {
  const b = Math.max(0, Number.isFinite(base) ? base : 0);
  for (const bracket of brackets) {
    if (b <= (bracket.upTo ?? Infinity)) return bracket.rate;
  }
  return brackets.length > 0 ? brackets[brackets.length - 1].rate : 0;
}

/** Tipo efectivo (%) = cuota / base. 0 si la base es 0. */
export function effectiveRate(base: number, brackets: readonly Bracket[]): number {
  const b = Math.max(0, Number.isFinite(base) ? base : 0);
  if (b === 0) return 0;
  return (applyProgressiveBrackets(b, brackets) / b) * 100;
}

// ---------------------------------------------------------------------------
// Escalas oficiales (ejercicio 2026)
// ---------------------------------------------------------------------------

/**
 * IRPF — escala general (base liquidable general). Suma de la escala estatal y
 * la autonómica supletoria. Cada CCAA puede aprobar su propia escala autonómica,
 * por lo que el resultado real puede variar.
 * Fuente: AEAT, tramos IRPF 2026.
 */
export const IRPF_GENERAL: readonly Bracket[] = [
  { upTo: 12450, rate: 19 },
  { upTo: 20200, rate: 24 },
  { upTo: 35200, rate: 30 },
  { upTo: 60000, rate: 37 },
  { upTo: 300000, rate: 45 },
  { upTo: null, rate: 47 },
];

/**
 * IRPF — escala del ahorro (base liquidable del ahorro): intereses, dividendos,
 * ganancias patrimoniales. Fuente: AEAT, base del ahorro 2026.
 */
export const IRPF_AHORRO: readonly Bracket[] = [
  { upTo: 6000, rate: 19 },
  { upTo: 50000, rate: 21 },
  { upTo: 200000, rate: 23 },
  { upTo: 300000, rate: 27 },
  { upTo: null, rate: 30 },
];

/**
 * Impuesto sobre el Patrimonio — escala estatal (supletoria). Aplicada por las
 * CCAA que no aprueban escala propia. Fuente: Ley 19/1991, art. 30.
 */
export const PATRIMONIO_ESTATAL: readonly Bracket[] = [
  { upTo: 167129.45, rate: 0.2 },
  { upTo: 334252.88, rate: 0.3 },
  { upTo: 668499.75, rate: 0.5 },
  { upTo: 1336999.51, rate: 0.9 },
  { upTo: 2673999.01, rate: 1.3 },
  { upTo: 5347998.03, rate: 1.7 },
  { upTo: 10695996.06, rate: 2.1 },
  { upTo: null, rate: 3.5 },
];

/**
 * Impuesto sobre Sucesiones y Donaciones — tarifa estatal (supletoria).
 * Fuente: Ley 29/1987, art. 21. Las CCAA pueden aprobar su propia tarifa.
 */
export const ISD_ESTATAL: readonly Bracket[] = [
  { upTo: 7993.46, rate: 7.65 },
  { upTo: 15980.91, rate: 8.5 },
  { upTo: 23968.36, rate: 9.35 },
  { upTo: 31955.81, rate: 10.2 },
  { upTo: 39943.26, rate: 11.05 },
  { upTo: 47930.72, rate: 11.9 },
  { upTo: 55918.17, rate: 12.75 },
  { upTo: 63905.62, rate: 13.6 },
  { upTo: 71893.07, rate: 14.45 },
  { upTo: 79880.52, rate: 15.3 },
  { upTo: 119757.67, rate: 16.15 },
  { upTo: 159634.83, rate: 18.7 },
  { upTo: 239389.13, rate: 21.25 },
  { upTo: 398777.54, rate: 25.5 },
  { upTo: 797555.08, rate: 29.75 },
  { upTo: null, rate: 34 },
];

// ---------------------------------------------------------------------------
// Constantes para el cálculo del rendimiento del trabajo (IRPF)
// ---------------------------------------------------------------------------

/**
 * Cotización del trabajador a la Seguridad Social (contrato indefinido), en
 * base 100: contingencias comunes 4,70 % + desempleo 1,55 % + FP 0,10 % +
 * MEI 0,15 %. Fuente: Orden de cotización 2026.
 */
export const SS_EMPLOYEE_RATE = 6.5;

/** Cotización del trabajador con contrato temporal (desempleo 1,60 % en lugar de 1,55 %). */
export const SS_EMPLOYEE_RATE_TEMPORAL = 6.55;

/** Base máxima de cotización a la Seguridad Social: 5.101,20 €/mes × 12. Fuente: 2026. */
export const SS_MAX_BASE_ANNUAL = 61214.4;

/** Otros gastos deducibles del rendimiento del trabajo (art. 19.2.f LIRPF). */
export const WORK_OTHER_EXPENSES = 2000;

/** Mínimo personal del contribuyente (general, < 65 años). Art. 57 LIRPF. */
export const MINIMO_PERSONAL = 5550;

/** Mínimo del contribuyente entre 65 y 74 años (5.550 + 1.150). */
export const MINIMO_PERSONAL_65 = 6700;

/** Mínimo del contribuyente a partir de 75 años (5.550 + 1.150 + 1.400). */
export const MINIMO_PERSONAL_75 = 8100;

/**
 * Mínimo por descendientes (art. 58 LIRPF), acumulativo por orden de hijo:
 * 1.º, 2.º, 3.º y 4.º en adelante. Se aplica completo (se asume que el
 * contribuyente computa el 100 %; si se reparte con el otro progenitor sería
 * la mitad).
 */
export const MINIMO_DESCENDIENTES = [2400, 2700, 4000, 4500] as const;

/** Incremento del mínimo por cada descendiente menor de 3 años. */
export const MINIMO_DESCENDIENTE_MENOR_3 = 2800;

/** Mínimo por cada ascendiente mayor de 65 años (o con discapacidad) a cargo. */
export const MINIMO_ASCENDIENTES = 1150;

/** Mínimo por discapacidad del contribuyente: grado 33-65 % y ≥ 65 %. */
export const MINIMO_DISCAPACIDAD_33 = 3000;
export const MINIMO_DISCAPACIDAD_65 = 9000;

/** Reducción en la base por tributación conjunta (unidad familiar biparental). */
export const REDUCCION_TRIBUTACION_CONJUNTA = 3400;

/** Límite anual de aportación individual a planes de pensiones con reducción. Art. 52 LIRPF. */
export const PENSION_INDIVIDUAL_LIMIT = 1500;

/**
 * Incremento del límite por contribuciones empresariales a planes de empleo
 * (sobre el límite individual). Art. 52.1 LIRPF: hasta 8.500 € adicionales.
 */
export const PENSION_EMPLOYER_LIMIT = 8500;

/**
 * Límite conjunto (individual + empresa) de aportaciones con reducción en la base
 * imponible general: 10.000 €. Art. 52.1 LIRPF. En todo caso, sujeto también al
 * 30 % de los rendimientos netos del trabajo y de actividades económicas.
 */
export const PENSION_JOINT_LIMIT = 10000;

/**
 * Estimación directa simplificada — porcentaje de "gastos de difícil
 * justificación" (provisiones deducibles y gastos de difícil justificación):
 * 5 % del rendimiento neto positivo previo. Art. 30 del Reglamento del IRPF
 * (RD 439/2007). Nota: el 7 % fue excepcional del ejercicio 2023; para el
 * ejercicio de referencia (2026) rige de nuevo el 5 %.
 */
export const SELF_EMPLOYED_DIFFICULT_EXPENSES_RATE = 5;

/** Tope anual de los gastos de difícil justificación (estimación directa simplificada). */
export const SELF_EMPLOYED_DIFFICULT_EXPENSES_CAP = 2000;

/**
 * Reducción por obtención de rendimientos del trabajo (art. 20 LIRPF). Es una
 * escala decreciente de tres tramos sobre el rendimiento neto previo:
 *  1. Hasta `..._FULL_LIMIT`: se aplica el importe máximo.
 *  2. Hasta `..._TIER2_LIMIT`: el máximo menos `..._TIER2_SLOPE` € por cada euro
 *     que excede del primer límite.
 *  3. Hasta `..._TIER3_LIMIT`: `..._TIER3_BASE` menos `..._TIER3_SLOPE` € por
 *     cada euro que excede del segundo límite.
 * Por encima del tercer límite la reducción es 0.
 * Fuente: AEAT, ejercicio de referencia (ver `FISCAL_YEAR`).
 */
export const WORK_INCOME_REDUCTION_FULL_LIMIT = 14852;
export const WORK_INCOME_REDUCTION_MAX = 7302;
export const WORK_INCOME_REDUCTION_TIER2_LIMIT = 17673.52;
export const WORK_INCOME_REDUCTION_TIER2_SLOPE = 1.75;
export const WORK_INCOME_REDUCTION_TIER3_LIMIT = 19747.5;
export const WORK_INCOME_REDUCTION_TIER3_BASE = 2364.34;
export const WORK_INCOME_REDUCTION_TIER3_SLOPE = 1.14;
