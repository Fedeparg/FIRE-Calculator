// Retención de IRPF en nómina sobre el motor bruto→neto. Core puro, orientativo.

import { estimateNetSalary, type NetSalaryInput } from "../fiscal/irpf.js";

export interface PayrollWithholdingResult {
  /** Importes por paga (12 o 14 pagas). */
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
