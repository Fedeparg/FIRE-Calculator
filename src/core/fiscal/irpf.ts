// IRPF sobre rendimientos del trabajo: motor compartido por las calculadoras de
// salario bruto→neto, retención en nómina, desgravación de planes de pensiones
// e IRPF de autónomos. Core puro.
//
// Modelo ORIENTATIVO pero detallado: aproxima el cálculo de la AEAT por el
// método de doble escala (cuota sobre la base − cuota sobre el mínimo personal y
// familiar). Supone CCAA con escala autonómica supletoria (la estatal); la parte
// autonómica real puede variar. No contempla deducciones autonómicas concretas.

import {
  IRPF_GENERAL,
  MINIMO_ASCENDIENTES,
  MINIMO_DESCENDIENTES,
  MINIMO_DESCENDIENTE_MENOR_3,
  MINIMO_DISCAPACIDAD_33,
  MINIMO_DISCAPACIDAD_65,
  MINIMO_PERSONAL,
  MINIMO_PERSONAL_65,
  MINIMO_PERSONAL_75,
  REDUCCION_TRIBUTACION_CONJUNTA,
  SS_EMPLOYEE_RATE,
  SS_EMPLOYEE_RATE_TEMPORAL,
  SS_MAX_BASE_ANNUAL,
  WORK_OTHER_EXPENSES,
  applyProgressiveBrackets,
} from "./brackets";

export type ContractType = "indefinido" | "temporal";
/** Grado de discapacidad del contribuyente. */
export type DisabilityGrade = "none" | "g33" | "g65";

/** Circunstancias personales y familiares que afectan al mínimo y a la cuota. */
export interface PersonalCircumstances {
  /** Edad del contribuyente (afecta al mínimo personal). Por defecto < 65. */
  age?: number;
  /** Tipo de contrato (afecta a la cotización por desempleo). */
  contractType?: ContractType;
  /** Número de hijos/descendientes a cargo. */
  children?: number;
  /** De esos hijos, cuántos son menores de 3 años. */
  childrenUnder3?: number;
  /** Ascendientes mayores de 65 años a cargo. */
  ascendants?: number;
  /** Grado de discapacidad del contribuyente. */
  disability?: DisabilityGrade;
  /** Tributación conjunta (unidad familiar): aplica una reducción en la base. */
  jointReturn?: boolean;
}

/**
 * Reducción por obtención de rendimientos del trabajo (art. 20 LIRPF), tres
 * tramos. Nunca negativa. Fuente: AEAT, ejercicio 2025-2026.
 */
export function workIncomeReduction(netWorkIncome: number): number {
  const r = Math.max(0, Number.isFinite(netWorkIncome) ? netWorkIncome : 0);
  if (r <= 14852) return 7302;
  if (r <= 17673.52) return Math.max(0, 7302 - 1.75 * (r - 14852));
  if (r <= 19747.5) return Math.max(0, 2364.34 - 1.14 * (r - 17673.52));
  return 0;
}

/**
 * Mínimo personal y familiar (arts. 57-60 LIRPF): la parte de renta que no
 * tributa. Suma el mínimo del contribuyente y los incrementos por descendientes,
 * ascendientes y discapacidad. Los descendientes se computan al 100 %.
 */
export function personalAndFamilyMinimum(c: PersonalCircumstances = {}): number {
  const age = Math.max(0, c.age ?? 0);
  let min = age >= 75 ? MINIMO_PERSONAL_75 : age >= 65 ? MINIMO_PERSONAL_65 : MINIMO_PERSONAL;

  const children = Math.max(0, Math.floor(c.children ?? 0));
  for (let i = 0; i < children; i++) {
    min += MINIMO_DESCENDIENTES[Math.min(i, MINIMO_DESCENDIENTES.length - 1)];
  }
  const under3 = Math.min(children, Math.max(0, Math.floor(c.childrenUnder3 ?? 0)));
  min += MINIMO_DESCENDIENTE_MENOR_3 * under3;

  min += MINIMO_ASCENDIENTES * Math.max(0, Math.floor(c.ascendants ?? 0));

  if (c.disability === "g65") min += MINIMO_DISCAPACIDAD_65;
  else if (c.disability === "g33") min += MINIMO_DISCAPACIDAD_33;

  return min;
}

/**
 * Cuota íntegra del IRPF sobre la base liquidable general, por el método de
 * doble escala: cuota(base) − cuota(mínimo). Nunca negativa. Si no se pasa
 * mínimo, usa el mínimo personal general (5.550 €).
 */
export function generalIncomeTax(taxableBase: number, minimum: number = MINIMO_PERSONAL): number {
  const base = Math.max(0, Number.isFinite(taxableBase) ? taxableBase : 0);
  const onBase = applyProgressiveBrackets(base, IRPF_GENERAL);
  const onMinimum = applyProgressiveBrackets(Math.max(0, minimum), IRPF_GENERAL);
  return Math.max(0, onBase - onMinimum);
}

export interface NetSalaryInput extends PersonalCircumstances {
  /** Salario bruto anual. */
  grossAnnual: number;
  /** Número de pagas al año (12 o 14). Por defecto 14. */
  payments?: number;
  /** Aportación anual a plan de pensiones (reduce la base). Por defecto 0. */
  pensionContribution?: number;
}

export interface NetSalaryResult {
  grossAnnual: number;
  /** Cotización del trabajador a la Seguridad Social (anual). */
  socialSecurity: number;
  /** Rendimiento neto del trabajo tras gastos y reducción. */
  netWorkIncome: number;
  /** Mínimo personal y familiar aplicado. */
  personalMinimum: number;
  /** Base liquidable general (tras aportaciones y reducción conjunta). */
  taxableBase: number;
  /** Cuota de IRPF anual estimada. */
  incomeTax: number;
  /** Salario neto anual. */
  netAnnual: number;
  /** Salario neto por paga. */
  netPerPayment: number;
  /** Tipo de retención efectivo sobre el bruto (%). */
  withholdingRate: number;
  /** Tipo total (SS + IRPF) sobre el bruto (%). */
  totalDeductionRate: number;
}

/** Estima el salario neto a partir del bruto anual y las circunstancias. */
export function estimateNetSalary(input: NetSalaryInput): NetSalaryResult {
  const grossAnnual = Math.max(0, input.grossAnnual || 0);
  const payments = input.payments === 12 ? 12 : 14;
  const pension = Math.max(0, input.pensionContribution || 0);

  const ssRate = input.contractType === "temporal" ? SS_EMPLOYEE_RATE_TEMPORAL : SS_EMPLOYEE_RATE;
  const ssBase = Math.min(grossAnnual, SS_MAX_BASE_ANNUAL);
  const socialSecurity = ssBase * (ssRate / 100);

  const netBeforeReduction = Math.max(0, grossAnnual - socialSecurity - WORK_OTHER_EXPENSES);
  const reduction = workIncomeReduction(netBeforeReduction);
  const netWorkIncome = Math.max(0, netBeforeReduction - reduction);

  const jointReduction = input.jointReturn ? REDUCCION_TRIBUTACION_CONJUNTA : 0;
  const taxableBase = Math.max(0, netWorkIncome - pension - jointReduction);

  const personalMinimum = personalAndFamilyMinimum(input);
  const incomeTax = generalIncomeTax(taxableBase, personalMinimum);
  const netAnnual = grossAnnual - socialSecurity - incomeTax;

  return {
    grossAnnual,
    socialSecurity,
    netWorkIncome,
    personalMinimum,
    taxableBase,
    incomeTax,
    netAnnual,
    netPerPayment: netAnnual / payments,
    withholdingRate: grossAnnual > 0 ? (incomeTax / grossAnnual) * 100 : 0,
    totalDeductionRate: grossAnnual > 0 ? ((socialSecurity + incomeTax) / grossAnnual) * 100 : 0,
  };
}
