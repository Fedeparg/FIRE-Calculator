// Retención de IRPF en nómina. Reutiliza el motor de salario bruto→neto y
// expone la retención mensual estimada. Core puro. Orientativo.

import { estimateNetSalary, type NetSalaryInput } from "../fiscal/irpf.js";

export interface PayrollWithholdingResult {
  /** Bruto mensual (por paga). */
  grossPerPayment: number;
  /** Retención de IRPF mensual (por paga). */
  withholdingPerPayment: number;
  /** Cotización del trabajador a la SS mensual (por paga). */
  socialSecurityPerPayment: number;
  /** Neto mensual (por paga). */
  netPerPayment: number;
  /** Tipo de retención de IRPF sobre el bruto (%). */
  withholdingRate: number;
  /** Retención de IRPF anual. */
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
