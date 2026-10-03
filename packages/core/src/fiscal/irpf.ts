// IRPF on employment income (payslip, withholding, pension plans, self-employed): an indicative
// approximation of the AEAT two-scale calculation. Pure core module.
// Scope and assumptions: see ./README.md. With no region, the default regional scale applies.

import { itemAt } from "../arrays.js";
import { nonNegative } from "../inputs.js";
import {
  IRPF_STATE_SCALE,
  IRPF_GENERAL_SCALE,
  PERSONAL_MINIMUM,
  JOINT_RETURN_REDUCTION,
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

/** Contract types, in the order the dropdown offers them. */
export const CONTRACT_TYPES = ["indefinido", "temporal"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
/** Payments per year in the payslip calculators; strings because they are a dropdown's value. */
export const PAYMENT_COUNTS = ["14", "12"] as const;
export type PaymentCount = (typeof PAYMENT_COUNTS)[number];

/** Answer to "joint return" (yes/no dropdown). */
export const JOINT_RETURN_OPTIONS = ["no", "yes"] as const;
export type JointReturnOption = (typeof JOINT_RETURN_OPTIONS)[number];

/** Recognised disability grades, from lowest to highest. */
export const DISABILITY_GRADES = ["none", "g33", "g65"] as const;
export type DisabilityGrade = (typeof DISABILITY_GRADES)[number];

/** Personal and family circumstances that affect the minimum and the tax. */
export interface PersonalCircumstances {
  /** Taxpayer's age (affects the personal minimum). Defaults to under 65. */
  age?: number;
  /** Contract type (affects the unemployment contribution). */
  contractType?: ContractType;
  /** Number of dependent children/descendants. */
  children?: number;
  /** How many of those children are under 3. */
  childrenUnder3?: number;
  /** Dependent ascendants over 65. */
  ascendants?: number;
  /** Taxpayer's disability grade. */
  disability?: DisabilityGrade;
  /** Joint taxation (family unit): applies a reduction to the base. */
  jointReturn?: boolean;
  /** Common-regime region; when unset, the default regional scale. */
  region?: RegionCode;
}

/** Employment income reduction (art. 20 LIRPF), never negative; figures in `brackets.ts`. */
export function workIncomeReduction(netWorkIncome: number): number {
  const r = nonNegative(netWorkIncome);
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

/** Cap on dependants per category: without it, `children = Infinity` would loop forever. */
const MAX_DEPENDANTS = 50;

const dependants = (n: number | undefined): number => Math.min(MAX_DEPENDANTS, Math.max(0, Math.floor(n ?? 0)));

/** Applies a minimums schedule to some circumstances; works for the state and regional ones. */
function minimumFromSchedule(schedule: PersonalMinimumSchedule, c: PersonalCircumstances): number {
  const age = Math.max(0, c.age ?? 0);
  let min = age >= 75 ? schedule.taxpayer75 : age >= 65 ? schedule.taxpayer65 : schedule.taxpayer;

  const children = dependants(c.children);
  for (let i = 0; i < children; i++) {
    // From the fourth child on, the schedule's last amount repeats (never empty).
    min += itemAt(schedule.descendants, Math.min(i, schedule.descendants.length - 1));
  }
  const under3 = Math.min(children, dependants(c.childrenUnder3));
  min += schedule.descendantUnder3 * under3;

  min += schedule.ascendant65 * dependants(c.ascendants);

  if (c.disability === "g65") min += schedule.disability65;
  else if (c.disability === "g33") min += schedule.disability33;

  return min;
}

/**
 * State personal and family minimum (mínimo personal y familiar, arts. 57-60 LIRPF), with
 * descendants at 100%. It always feeds the state tax, even if the region has its own amounts.
 */
export function personalAndFamilyMinimum(c: PersonalCircumstances = {}): number {
  return minimumFromSchedule(STATE_PERSONAL_MINIMUM, c);
}

/** Minimum for the regional tax: the region's own if it has one (art. 46.1.a Ley 22/2009), otherwise the state one. */
export function regionalPersonalAndFamilyMinimum(c: PersonalCircumstances = {}): number {
  const schedule = c.region === undefined ? STATE_PERSONAL_MINIMUM : regionalMinimumSchedule(c.region);
  return minimumFromSchedule(schedule, c);
}

/** Optional settings for `generalIncomeTax`. */
export interface GeneralIncomeTaxOptions {
  /** Common-regime region (comunidad autónoma de régimen común). When unset: default regional scale. */
  readonly region?: RegionCode;
  /** Regional minimum; only with a region. Defaults to the state one in `minimum`. */
  readonly regionalMinimum?: number;
}

/**
 * IRPF gross tax liability (cuota íntegra) on the general taxable base (two-scale method:
 * tax(base) − tax(minimum)), never negative. With no region it uses `IRPF_GENERAL_SCALE`; with
 * a region it adds the state and regional taxes, each floored at zero separately.
 */
export function generalIncomeTax(
  taxableBase: number,
  minimum: number = PERSONAL_MINIMUM,
  options: GeneralIncomeTaxOptions = {},
): number {
  const base = nonNegative(taxableBase);
  const stateMinimum = Math.max(0, minimum);

  if (options.region === undefined) {
    const onBase = applyProgressiveBrackets(base, IRPF_GENERAL_SCALE);
    const onMinimum = applyProgressiveBrackets(stateMinimum, IRPF_GENERAL_SCALE);
    return Math.max(0, onBase - onMinimum);
  }

  const scale = regionalScale(options.region);
  const regionalMinimum = Math.max(0, options.regionalMinimum ?? stateMinimum);

  const stateQuota = Math.max(
    0,
    applyProgressiveBrackets(base, IRPF_STATE_SCALE) - applyProgressiveBrackets(stateMinimum, IRPF_STATE_SCALE),
  );
  const regionalQuota = Math.max(
    0,
    applyProgressiveBrackets(base, scale) - applyProgressiveBrackets(regionalMinimum, scale),
  );

  return stateQuota + regionalQuota;
}

/** General IRPF marginal rate (%), state + regional (default regional scale with no region). */
export function generalMarginalRate(taxableBase: number, region?: RegionCode): number {
  if (region === undefined) return marginalRate(taxableBase, IRPF_GENERAL_SCALE);
  return marginalRate(taxableBase, IRPF_STATE_SCALE) + marginalRate(taxableBase, regionalScale(region));
}

export interface NetSalaryInput extends PersonalCircumstances {
  /** Annual gross salary. */
  grossAnnual: number;
  /** Number of payments per year (12 or 14). Defaults to 14. */
  payments?: number;
  /** Annual pension-plan contribution (reduces the base). Defaults to 0. */
  pensionContribution?: number;
}

export interface NetSalaryResult {
  grossAnnual: number;
  /** Employee Social Security contribution (annual). */
  socialSecurity: number;
  /** Net employment income after expenses and reduction. */
  netWorkIncome: number;
  /** State minimum applied; the regional tax may have used the region's own. */
  personalMinimum: number;
  /** General taxable base (after contributions and the joint-return reduction). */
  taxableBase: number;
  /** Estimated annual IRPF tax. */
  incomeTax: number;
  /** Annual net salary. */
  netAnnual: number;
  /** Net salary per payment. */
  netPerPayment: number;
  /** Effective withholding rate on gross (%). */
  withholdingRate: number;
  /** Total rate (SS + IRPF) on gross (%). */
  totalDeductionRate: number;
}

/** Estimates the net salary from the annual gross and the circumstances. */
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

  const jointReduction = input.jointReturn ? JOINT_RETURN_REDUCTION : 0;
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
