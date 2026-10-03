// Payroll IRPF withholding on top of the gross→net engine. Pure core, indicative only.

import { estimateNetSalary, type NetSalaryInput } from "../fiscal/irpf.js";

export interface PayrollWithholdingResult {
  /** Amounts per payment (12 or 14 payments a year). */
  grossPerPayment: number;
  withholdingPerPayment: number;
  socialSecurityPerPayment: number;
  netPerPayment: number;
  withholdingRate: number;
  annualWithholding: number;
}

export function computePayrollWithholding(input: NetSalaryInput): PayrollWithholdingResult {
  const r = estimateNetSalary(input);
  const payments = input.payments === 12 ? 12 : 14;

  return {
    grossPerPayment: r.grossAnnual / payments,
    withholdingPerPayment: r.incomeTax / payments,
    socialSecurityPerPayment: r.socialSecurity / payments,
    netPerPayment: r.netPerPayment,
    withholdingRate: r.withholdingRate,
    annualWithholding: r.incomeTax,
  };
}
