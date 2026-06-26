// Desgravación por aportación a un plan de pensiones. Calcula el ahorro fiscal
// real (lo que dejas de pagar de IRPF) al reducir la base imponible general.
// Core puro. Modelo orientativo.

import { PENSION_INDIVIDUAL_LIMIT } from "../fiscal/brackets";
import { estimateNetSalary, generalIncomeTax } from "../fiscal/irpf";

export interface PensionReliefInput {
  /** Salario bruto anual (para situar el tramo marginal). */
  grossAnnual: number;
  /** Aportación anual deseada al plan de pensiones. */
  contribution: number;
}

export interface PensionReliefResult {
  /** Aportación efectiva tras aplicar el límite legal. */
  appliedContribution: number;
  /** Parte de la aportación que excede el límite y no desgrava. */
  excess: number;
  /** Ahorro de IRPF gracias a la aportación. */
  taxSaving: number;
  /** Coste real de la aportación (aportación − ahorro fiscal). */
  netCost: number;
  /** Porcentaje de la aportación que recuperas vía IRPF. */
  savingRate: number;
}

export function computePensionRelief(input: PensionReliefInput): PensionReliefResult {
  const grossAnnual = Math.max(0, input.grossAnnual || 0);
  const requested = Math.max(0, input.contribution || 0);

  const base = estimateNetSalary({ grossAnnual });
  // Límite: menor entre 1.500 € y el 30 % del rendimiento neto del trabajo.
  const cap = Math.min(PENSION_INDIVIDUAL_LIMIT, base.netWorkIncome * 0.3);
  const appliedContribution = Math.min(requested, cap);
  const excess = requested - appliedContribution;

  const taxBefore = generalIncomeTax(base.netWorkIncome);
  const taxAfter = generalIncomeTax(base.netWorkIncome - appliedContribution);
  const taxSaving = Math.max(0, taxBefore - taxAfter);

  return {
    appliedContribution,
    excess,
    taxSaving,
    netCost: appliedContribution - taxSaving,
    savingRate: appliedContribution > 0 ? (taxSaving / appliedContribution) * 100 : 0,
  };
}
