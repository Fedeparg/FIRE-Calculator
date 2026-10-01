// IRPF sobre rendimientos del trabajo (nómina, retención, planes de pensiones, autónomos):
// aproximación orientativa del cálculo de la AEAT por doble escala. Core puro.
// Alcance y supuestos: ver ./README.md. Sin comunidad rige la escala supletoria.

import {
  IRPF_ESTATAL_GENERAL,
  IRPF_GENERAL,
  MINIMO_PERSONAL,
  REDUCCION_TRIBUTACION_CONJUNTA,
  SS_EMPLOYEE_RATE,
  SS_EMPLOYEE_RATE_TEMPORAL,
  SS_MAX_BASE_ANNUAL,
  WORK_INCOME_REDUCTION_FULL_LIMIT,
  WORK_INCOME_REDUCTION_MAX,
  WORK_INCOME_REDUCTION_TIER2_LIMIT,
  WORK_INCOME_REDUCTION_TIER2_SLOPE,
  WORK_INCOME_REDUCTION_TIER3_BASE,
  WORK_INCOME_REDUCTION_TIER3_LIMIT,
  WORK_INCOME_REDUCTION_TIER3_SLOPE,
  WORK_OTHER_EXPENSES,
  applyProgressiveBrackets,
  marginalRate,
} from "./brackets.js";
import {
  STATE_PERSONAL_MINIMUM,
  regionalMinimumSchedule,
  regionalScale,
  type PersonalMinimumSchedule,
  type RegionCode,
} from "./regions.js";

/** Tipos de contrato, en el orden en que se ofrecen en el desplegable. */
export const CONTRACT_TYPES = ["indefinido", "temporal"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
/** Pagas al año de las calculadoras de nómina; son texto porque son el valor de un desplegable. */
export const PAYMENT_COUNTS = ["14", "12"] as const;
export type PaymentCount = (typeof PAYMENT_COUNTS)[number];

/** Respuesta a "declaración conjunta" (desplegable sí/no). */
export const JOINT_RETURN_OPTIONS = ["no", "yes"] as const;
export type JointReturnOption = (typeof JOINT_RETURN_OPTIONS)[number];

/** Grados de discapacidad reconocidos, de menor a mayor. */
export const DISABILITY_GRADES = ["none", "g33", "g65"] as const;
export type DisabilityGrade = (typeof DISABILITY_GRADES)[number];

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
  /** Comunidad de régimen común; sin valor, escala supletoria. */
  region?: RegionCode;
}

/** Reducción por rendimientos del trabajo (art. 20 LIRPF), nunca negativa; cifras en `brackets.ts`. */
export function workIncomeReduction(netWorkIncome: number): number {
  const r = Math.max(0, Number.isFinite(netWorkIncome) ? netWorkIncome : 0);
  if (r <= WORK_INCOME_REDUCTION_FULL_LIMIT) return WORK_INCOME_REDUCTION_MAX;
  if (r <= WORK_INCOME_REDUCTION_TIER2_LIMIT) {
    return Math.max(
      0,
      WORK_INCOME_REDUCTION_MAX - WORK_INCOME_REDUCTION_TIER2_SLOPE * (r - WORK_INCOME_REDUCTION_FULL_LIMIT),
    );
  }
  if (r <= WORK_INCOME_REDUCTION_TIER3_LIMIT) {
    return Math.max(
      0,
      WORK_INCOME_REDUCTION_TIER3_BASE - WORK_INCOME_REDUCTION_TIER3_SLOPE * (r - WORK_INCOME_REDUCTION_TIER2_LIMIT),
    );
  }
  return 0;
}

/** Tope de personas a cargo por categoría: sin él, `children = Infinity` haría un bucle sin fin. */
const MAX_DEPENDANTS = 50;

const dependants = (n: number | undefined): number => Math.min(MAX_DEPENDANTS, Math.max(0, Math.floor(n ?? 0)));

/** Aplica un cuadro de mínimos a unas circunstancias; sirve para el estatal y los autonómicos. */
function minimumFromSchedule(schedule: PersonalMinimumSchedule, c: PersonalCircumstances): number {
  const age = Math.max(0, c.age ?? 0);
  let min = age >= 75 ? schedule.taxpayer75 : age >= 65 ? schedule.taxpayer65 : schedule.taxpayer;

  const children = dependants(c.children);
  for (let i = 0; i < children; i++) {
    min += schedule.descendants[Math.min(i, schedule.descendants.length - 1)];
  }
  const under3 = Math.min(children, dependants(c.childrenUnder3));
  min += schedule.descendantUnder3 * under3;

  min += schedule.ascendant65 * dependants(c.ascendants);

  if (c.disability === "g65") min += schedule.disability65;
  else if (c.disability === "g33") min += schedule.disability33;

  return min;
}

/**
 * Mínimo personal y familiar estatal (arts. 57-60 LIRPF), con descendientes al 100 %.
 * Siempre alimenta la cuota estatal, aunque la comunidad tenga importes propios.
 */
export function personalAndFamilyMinimum(c: PersonalCircumstances = {}): number {
  return minimumFromSchedule(STATE_PERSONAL_MINIMUM, c);
}

/** Mínimo de la cuota autonómica: el de la comunidad si lo tiene (art. 46.1.a Ley 22/2009), si no el estatal. */
export function regionalPersonalAndFamilyMinimum(c: PersonalCircumstances = {}): number {
  const schedule = c.region === undefined ? STATE_PERSONAL_MINIMUM : regionalMinimumSchedule(c.region);
  return minimumFromSchedule(schedule, c);
}

/** Ajustes opcionales de `generalIncomeTax`. */
export interface GeneralIncomeTaxOptions {
  /** Comunidad autónoma de régimen común. Sin valor: escala supletoria. */
  readonly region?: RegionCode;
  /** Mínimo autonómico; solo con comunidad. Por defecto, el estatal de `minimum`. */
  readonly regionalMinimum?: number;
}

/**
 * Cuota íntegra del IRPF sobre la base liquidable general (doble escala:
 * cuota(base) − cuota(mínimo)), nunca negativa. Sin comunidad usa `IRPF_GENERAL`; con
 * comunidad suma cuota estatal y autonómica, cada una acotada a cero por separado.
 */
export function generalIncomeTax(
  taxableBase: number,
  minimum: number = MINIMO_PERSONAL,
  options: GeneralIncomeTaxOptions = {},
): number {
  const base = Math.max(0, Number.isFinite(taxableBase) ? taxableBase : 0);
  const stateMinimum = Math.max(0, minimum);

  if (options.region === undefined) {
    const onBase = applyProgressiveBrackets(base, IRPF_GENERAL);
    const onMinimum = applyProgressiveBrackets(stateMinimum, IRPF_GENERAL);
    return Math.max(0, onBase - onMinimum);
  }

  const scale = regionalScale(options.region);
  const regionalMinimum = Math.max(0, options.regionalMinimum ?? stateMinimum);

  const stateQuota = Math.max(
    0,
    applyProgressiveBrackets(base, IRPF_ESTATAL_GENERAL) - applyProgressiveBrackets(stateMinimum, IRPF_ESTATAL_GENERAL),
  );
  const regionalQuota = Math.max(
    0,
    applyProgressiveBrackets(base, scale) - applyProgressiveBrackets(regionalMinimum, scale),
  );

  return stateQuota + regionalQuota;
}

/** Tipo marginal (%) del IRPF general, estatal + autonómico (supletoria sin comunidad). */
export function generalMarginalRate(taxableBase: number, region?: RegionCode): number {
  if (region === undefined) return marginalRate(taxableBase, IRPF_GENERAL);
  return marginalRate(taxableBase, IRPF_ESTATAL_GENERAL) + marginalRate(taxableBase, regionalScale(region));
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
  /** Mínimo estatal aplicado; la cuota autonómica puede haber usado el de la comunidad. */
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
  const incomeTax = generalIncomeTax(taxableBase, personalMinimum, {
    region: input.region,
    regionalMinimum: regionalPersonalAndFamilyMinimum(input),
  });
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
