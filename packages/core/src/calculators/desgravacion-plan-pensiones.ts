// Pension plan tax relief: the IRPF saved by reducing the general tax base (base general).
// Pure core, indicative only. Art. 52 LIRPF: only the individual contribution saves IRPF. The
// employer's is imputed as income in kind and deducted from the base by the same amount (net effect
// ≈ 0); here it only counts toward the joint limit (€10,000).

import {
  PENSION_EMPLOYER_LIMIT,
  PENSION_INDIVIDUAL_LIMIT,
  PENSION_JOINT_LIMIT,
  PENSION_NET_INCOME_CAP_RATE,
} from "../fiscal/brackets.js";
import {
  estimateNetSalary,
  generalIncomeTax,
  personalAndFamilyMinimum,
  regionalPersonalAndFamilyMinimum,
} from "../fiscal/irpf.js";
import type { RegionCode } from "../fiscal/regions.js";

export interface PensionReliefInput {
  grossAnnual: number;
  contribution: number;
  /** Annual employer contribution; it saves no IRPF, it only raises the joint limit to €10,000. Defaults to 0. */
  employerContribution?: number;
  /**
   * Autonomous community (comunidad autónoma; the regional marginal rate varies a lot); when absent,
   * the fallback scale (escala supletoria) applies.
   */
  region?: RegionCode;
}

export interface PensionReliefResult {
  appliedContribution: number;
  excess: number;
  employerApplied: number;
  totalApplied: number;
  taxSaving: number;
  netCost: number;
  savingRate: number;
}

export function computePensionRelief(input: PensionReliefInput): PensionReliefResult {
  const grossAnnual = Math.max(0, input.grossAnnual || 0);
  const requested = Math.max(0, input.contribution || 0);
  const employerRequested = Math.max(0, input.employerContribution || 0);

  const base = estimateNetSalary({ grossAnnual, region: input.region });
  // 30% of net employment income caps all contributions combined.
  const thirtyPercentCap = base.netWorkIncome * (PENSION_NET_INCOME_CAP_RATE / 100);

  // Individual: the lower of €1,500 and the 30%.
  const individualCap = Math.min(PENSION_INDIVIDUAL_LIMIT, thirtyPercentCap);
  const appliedContribution = Math.min(requested, individualCap);
  const excess = requested - appliedContribution;

  // Employer: up to €8,500, within the €10,000 joint limit and the 30%.
  const jointCap = Math.min(PENSION_JOINT_LIMIT, thirtyPercentCap);
  const employerRoom = Math.max(0, Math.min(PENSION_EMPLOYER_LIMIT, jointCap - appliedContribution));
  const employerApplied = Math.min(employerRequested, employerRoom);

  // Only the individual contribution saves IRPF; the taxpayer minimum is used without family circumstances.
  const taxOptions = {
    region: input.region,
    regionalMinimum: regionalPersonalAndFamilyMinimum({ region: input.region }),
  };
  const minimum = personalAndFamilyMinimum();
  const taxBefore = generalIncomeTax(base.netWorkIncome, minimum, taxOptions);
  const taxAfter = generalIncomeTax(base.netWorkIncome - appliedContribution, minimum, taxOptions);
  const taxSaving = Math.max(0, taxBefore - taxAfter);

  return {
    appliedContribution,
    excess,
    employerApplied,
    totalApplied: appliedContribution + employerApplied,
    taxSaving,
    netCost: appliedContribution - taxSaving,
    savingRate: appliedContribution > 0 ? (taxSaving / appliedContribution) * 100 : 0,
  };
}
