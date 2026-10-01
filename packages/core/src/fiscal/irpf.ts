// IRPF sobre rendimientos del trabajo: motor compartido por las calculadoras de
// salario bruto→neto, retención en nómina, desgravación de planes de pensiones
// e IRPF de autónomos. Core puro.
//
// Modelo ORIENTATIVO pero detallado: aproxima el cálculo de la AEAT por el
// método de doble escala (cuota sobre la base − cuota sobre el mínimo personal y
// familiar).
//
// La comunidad autónoma es OPCIONAL:
//  - Sin comunidad: se aplica la escala conjunta `IRPF_GENERAL` (estatal +
//    autonómica supletoria del art. 65 LIRPF) y el mínimo estatal. Es el
//    comportamiento histórico de este módulo y el que rige para Ceuta y Melilla.
//  - Con comunidad: cuota estatal (escala y mínimo estatales) + cuota autonómica
//    (escala de la comunidad y su mínimo propio si lo ha aprobado), cada una
//    acotada a cero por separado. Ver `regions.ts`.
//
// No contempla deducciones autonómicas concretas, que son muchas y afectan al
// resultado real.

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
/** Grado de discapacidad del contribuyente. */
/**
 * Número de pagas al año que ofrecen las calculadoras de nómina. Es TEXTO porque es el
 * valor de un desplegable; el cálculo lo convierte a número.
 */
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
  /**
   * Comunidad autónoma de residencia (régimen común). Sin valor se aplica la
   * escala autonómica supletoria, que es el comportamiento por defecto.
   */
  region?: RegionCode;
}

/**
 * Reducción por obtención de rendimientos del trabajo (art. 20 LIRPF), tres
 * tramos. Nunca negativa. Los umbrales, importes y coeficientes viven en
 * `brackets.ts`, única fuente de verdad de las cifras fiscales.
 */
export function workIncomeReduction(netWorkIncome: number): number {
  const r = Math.max(0, Number.isFinite(netWorkIncome) ? netWorkIncome : 0);
  if (r <= WORK_INCOME_REDUCTION_FULL_LIMIT) return WORK_INCOME_REDUCTION_MAX;
  if (r <= WORK_INCOME_REDUCTION_TIER2_LIMIT) {
    return Math.max(
      0,
      WORK_INCOME_REDUCTION_MAX -
        WORK_INCOME_REDUCTION_TIER2_SLOPE * (r - WORK_INCOME_REDUCTION_FULL_LIMIT),
    );
  }
  if (r <= WORK_INCOME_REDUCTION_TIER3_LIMIT) {
    return Math.max(
      0,
      WORK_INCOME_REDUCTION_TIER3_BASE -
        WORK_INCOME_REDUCTION_TIER3_SLOPE * (r - WORK_INCOME_REDUCTION_TIER2_LIMIT),
    );
  }
  return 0;
}

/**
 * Aplica un cuadro de importes del mínimo personal y familiar a unas
 * circunstancias concretas. Aísla la aritmética para poder reutilizarla con el
 * cuadro estatal y con el autonómico, que difieren en los importes pero no en la
 * forma de acumularlos.
 */
function minimumFromSchedule(
  schedule: PersonalMinimumSchedule,
  c: PersonalCircumstances,
): number {
  const age = Math.max(0, c.age ?? 0);
  let min = age >= 75 ? schedule.taxpayer75 : age >= 65 ? schedule.taxpayer65 : schedule.taxpayer;

  const children = Math.max(0, Math.floor(c.children ?? 0));
  for (let i = 0; i < children; i++) {
    min += schedule.descendants[Math.min(i, schedule.descendants.length - 1)];
  }
  const under3 = Math.min(children, Math.max(0, Math.floor(c.childrenUnder3 ?? 0)));
  min += schedule.descendantUnder3 * under3;

  min += schedule.ascendant65 * Math.max(0, Math.floor(c.ascendants ?? 0));

  if (c.disability === "g65") min += schedule.disability65;
  else if (c.disability === "g33") min += schedule.disability33;

  return min;
}

/**
 * Mínimo personal y familiar ESTATAL (arts. 57-60 LIRPF): la parte de renta que
 * no tributa. Suma el mínimo del contribuyente y los incrementos por
 * descendientes, ascendientes y discapacidad. Los descendientes se computan al
 * 100 %. Es siempre el que alimenta la cuota estatal, aun cuando la comunidad
 * haya aprobado importes propios.
 */
export function personalAndFamilyMinimum(c: PersonalCircumstances = {}): number {
  return minimumFromSchedule(STATE_PERSONAL_MINIMUM, c);
}

/**
 * Mínimo personal y familiar que alimenta la CUOTA AUTONÓMICA: el de la comunidad
 * indicada si ha aprobado importes propios (art. 46.1.a Ley 22/2009), y el estatal
 * en caso contrario o si no se indica comunidad.
 */
export function regionalPersonalAndFamilyMinimum(c: PersonalCircumstances = {}): number {
  const schedule =
    c.region === undefined ? STATE_PERSONAL_MINIMUM : regionalMinimumSchedule(c.region);
  return minimumFromSchedule(schedule, c);
}

/** Ajustes opcionales de `generalIncomeTax`. */
export interface GeneralIncomeTaxOptions {
  /** Comunidad autónoma de régimen común. Sin valor: escala supletoria. */
  readonly region?: RegionCode;
  /**
   * Mínimo personal y familiar autonómico. Solo se usa si hay comunidad; por
   * defecto, el mismo mínimo estatal que se pasa en `minimum`.
   */
  readonly regionalMinimum?: number;
}

/**
 * Cuota íntegra del IRPF sobre la base liquidable general, por el método de
 * doble escala: cuota(base) − cuota(mínimo). Nunca negativa. Si no se pasa
 * mínimo, usa el mínimo personal general (5.550 €).
 *
 * Sin comunidad aplica la escala conjunta `IRPF_GENERAL`. Con comunidad suma dos
 * cuotas independientes, estatal y autonómica, cada una con su escala y su
 * mínimo y cada una acotada a cero por separado: una base que supera el mínimo
 * estatal pero no el autonómico paga cuota estatal y no paga cuota autonómica.
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
    applyProgressiveBrackets(base, IRPF_ESTATAL_GENERAL) -
      applyProgressiveBrackets(stateMinimum, IRPF_ESTATAL_GENERAL),
  );
  const regionalQuota = Math.max(
    0,
    applyProgressiveBrackets(base, scale) - applyProgressiveBrackets(regionalMinimum, scale),
  );

  return stateQuota + regionalQuota;
}

/**
 * Tipo marginal (%) del IRPF general: el conjunto estatal + autonómico. Sin
 * comunidad usa la escala conjunta supletoria.
 */
export function generalMarginalRate(taxableBase: number, region?: RegionCode): number {
  if (region === undefined) return marginalRate(taxableBase, IRPF_GENERAL);
  return (
    marginalRate(taxableBase, IRPF_ESTATAL_GENERAL) +
    marginalRate(taxableBase, regionalScale(region))
  );
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
  /**
   * Mínimo personal y familiar ESTATAL aplicado. Si la comunidad elegida tiene
   * mínimo propio, la cuota autonómica habrá usado ese otro importe.
   */
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
