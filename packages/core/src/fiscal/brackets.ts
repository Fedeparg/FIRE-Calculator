// Núcleo fiscal compartido: escalas oficiales y motor de tramos progresivos. Core puro.
// Alcance y supuestos: ver ./README.md. Cifras orientativas del ejercicio `FISCAL_YEAR`.

import { nonNegative } from "../inputs.js";

/** Ejercicio fiscal de referencia de las escalas de este módulo. */
export const FISCAL_YEAR = 2026;

/** `FISCAL_YEAR` como cadena: evita que el formato numérico del idioma lo pinte «2.026». */
export const FISCAL_YEAR_LABEL = String(FISCAL_YEAR);

/**
 * Fecha (`YYYY-MM-DD`) a partir de la cual hay que revisar las cifras de `FISCAL_YEAR`: escalas,
 * mínimos, Seguridad Social y `withholding-rates.ts`. Coincide con el arranque de la campaña de
 * Renta. Un test falla desde ese día: es un recordatorio ejecutable, no una caducidad del cálculo.
 * Al revisar, se actualizan `FISCAL_YEAR` y esta fecha.
 */
export const FISCAL_REVIEW_BY = "2027-04-01";

/** Tramo de una escala: `upTo` es el límite superior incluido (`null` = último); `rate` en % (19 = 19 %). */
export interface Bracket {
  readonly upTo: number | null;
  readonly rate: number;
}

/** Cuota de una base según una escala progresiva: cada tramo grava solo su porción de base. */
export function applyProgressiveBrackets(base: number, brackets: readonly Bracket[]): number {
  const b = nonNegative(base);
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
  const b = nonNegative(base);
  for (const bracket of brackets) {
    if (b <= (bracket.upTo ?? Infinity)) return bracket.rate;
  }
  return brackets.length > 0 ? brackets[brackets.length - 1].rate : 0;
}

export function effectiveRate(base: number, brackets: readonly Bracket[]): number {
  const b = nonNegative(base);
  if (b === 0) return 0;
  return (applyProgressiveBrackets(b, brackets) / b) * 100;
}

/**
 * IRPF — escala estatal de la base liquidable general (art. 63.1.1º LIRPF). Se aplica
 * tal cual, sin factor 0,5: la ley ya la da dividida por dos. Fuente: AEAT, Manual
 * práctico de Renta 2025.
 */
export const IRPF_ESTATAL_GENERAL: readonly Bracket[] = [
  { upTo: 12450, rate: 9.5 },
  { upTo: 20200, rate: 12 },
  { upTo: 35200, rate: 15 },
  { upTo: 60000, rate: 18.5 },
  { upTo: 300000, rate: 22.5 },
  { upTo: null, rate: 24.5 },
];

/**
 * IRPF — escala autonómica supletoria (art. 65 LIRPF). No es idéntica a la estatal:
 * su último tramo es un 22,50 % plano desde 60.000 €, sin el 24,50 % desde 300.000 €
 * (confundirlas daría 49 % en vez de 47 %). Rige para Ceuta y Melilla (DA 32ª LIRPF)
 * y no residentes, y es la que se usa sin comunidad (ver `regions.ts`).
 */
export const IRPF_AUTONOMICA_SUPLETORIA: readonly Bracket[] = [
  { upTo: 12450, rate: 9.5 },
  { upTo: 20200, rate: 12 },
  { upTo: 35200, rate: 15 },
  { upTo: 60000, rate: 18.5 },
  { upTo: null, rate: 22.5 },
];

/**
 * IRPF — escala general: suma tramo a tramo de la estatal y la supletoria (47 % =
 * 24,50 + 22,50). Se aplica sin comunidad; cada comunidad tiene la suya. Fuente: AEAT 2026.
 */
export const IRPF_GENERAL: readonly Bracket[] = [
  { upTo: 12450, rate: 19 },
  { upTo: 20200, rate: 24 },
  { upTo: 35200, rate: 30 },
  { upTo: 60000, rate: 37 },
  { upTo: 300000, rate: 45 },
  { upTo: null, rate: 47 },
];

/** IRPF — escala del ahorro (intereses, dividendos, ganancias patrimoniales). Fuente: AEAT 2026. */
export const IRPF_AHORRO: readonly Bracket[] = [
  { upTo: 6000, rate: 19 },
  { upTo: 50000, rate: 21 },
  { upTo: 200000, rate: 23 },
  { upTo: 300000, rate: 27 },
  { upTo: null, rate: 30 },
];

/** Impuesto sobre el Patrimonio — escala estatal (supletoria de las CCAA). Ley 19/1991, art. 30. */
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

/** Patrimonio — mínimo exento estatal (Ley 19/1991, art. 28); varias CCAA fijan otro. */
export const WEALTH_TAX_EXEMPT_MINIMUM = 700000;

/** Patrimonio — exención de la vivienda habitual, hasta este importe (Ley 19/1991, art. 4.Nueve). */
export const WEALTH_TAX_PRIMARY_RESIDENCE_EXEMPTION = 300000;

/** Sucesiones y Donaciones — tarifa estatal (supletoria de las CCAA). Ley 29/1987, art. 21. */
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

/**
 * Cotización del trabajador a la SS (indefinido), en %: contingencias comunes 4,70 +
 * desempleo 1,55 + FP 0,10 + MEI 0,15. Fuente: Orden de cotización 2026.
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

export const MINIMO_PERSONAL_65 = 6700;

export const MINIMO_PERSONAL_75 = 8100;

/**
 * Mínimo por descendientes (art. 58 LIRPF) por orden de hijo (1.º, 2.º, 3.º, 4.º y
 * siguientes). Se asume que el contribuyente computa el 100 % (compartido, la mitad).
 */
export const MINIMO_DESCENDIENTES = [2400, 2700, 4000, 4500] as const;

/** Incremento del mínimo por cada descendiente menor de 3 años. */
export const MINIMO_DESCENDIENTE_MENOR_3 = 2800;

export const MINIMO_ASCENDIENTES = 1150;

export const MINIMO_DISCAPACIDAD_33 = 3000;
export const MINIMO_DISCAPACIDAD_65 = 9000;

/**
 * Sucesiones y Donaciones — umbrales (€) de patrimonio preexistente de los cuatro tramos del
 * coeficiente multiplicador (Ley 29/1987, art. 22.2); el límite superior entra en su tramo.
 */
export const GIFT_TAX_WEALTH_TIERS = [402678.11, 2007380.43, 4020770.98] as const;

/**
 * Sucesiones y Donaciones — coeficiente multiplicador por grupo de parentesco y tramo de patrimonio
 * preexistente (Ley 29/1987, art. 22.2). Grupos I y II: cónyuge, descendientes y ascendientes; III:
 * colaterales de 2.º y 3.º grado y afines; IV: resto.
 */
export const GIFT_TAX_KINSHIP_COEFFICIENTS = {
  grupoI_II: [1.0, 1.05, 1.1, 1.2],
  grupoIII: [1.5882, 1.6676, 1.7471, 1.9059],
  grupoIV: [2.0, 2.1, 2.2, 2.4],
} as const;

/** Reducción en la base por tributación conjunta (unidad familiar biparental). */
export const REDUCCION_TRIBUTACION_CONJUNTA = 3400;

/** Límite anual de aportación individual a planes de pensiones con reducción. Art. 52 LIRPF. */
export const PENSION_INDIVIDUAL_LIMIT = 1500;

/** Incremento del límite por contribuciones empresariales a planes de empleo (art. 52.1 LIRPF). */
export const PENSION_EMPLOYER_LIMIT = 8500;

/** Límite conjunto (individual + empresa) con reducción en la base (art. 52.1 LIRPF); además, 30 % de los rendimientos netos. */
export const PENSION_JOINT_LIMIT = 10000;

/** Tope de las aportaciones a planes de pensiones: 30 % de los rendimientos netos del trabajo y de actividades (art. 52.1 LIRPF). */
export const PENSION_NET_INCOME_CAP_RATE = 30;

/**
 * Estimación directa simplificada — gastos de difícil justificación: 5 % del
 * rendimiento neto positivo previo (art. 30 RIRPF, RD 439/2007). El 7 % fue excepcional de 2023.
 */
export const SELF_EMPLOYED_DIFFICULT_EXPENSES_RATE = 5;

/** Tope anual de los gastos de difícil justificación (estimación directa simplificada). */
export const SELF_EMPLOYED_DIFFICULT_EXPENSES_CAP = 2000;

/**
 * Reducción por rendimientos del trabajo (art. 20 LIRPF), decreciente en tres tramos:
 * máximo hasta `FULL_LIMIT`; hasta `TIER2_LIMIT`, máximo − `TIER2_SLOPE` × exceso;
 * hasta `TIER3_LIMIT`, `TIER3_BASE` − `TIER3_SLOPE` × exceso; después, 0. Fuente: AEAT.
 */
export const WORK_INCOME_REDUCTION_FULL_LIMIT = 14852;
export const WORK_INCOME_REDUCTION_MAX = 7302;
export const WORK_INCOME_REDUCTION_TIER2_LIMIT = 17673.52;
export const WORK_INCOME_REDUCTION_TIER2_SLOPE = 1.75;
export const WORK_INCOME_REDUCTION_TIER3_LIMIT = 19747.5;
export const WORK_INCOME_REDUCTION_TIER3_BASE = 2364.34;
export const WORK_INCOME_REDUCTION_TIER3_SLOPE = 1.14;
