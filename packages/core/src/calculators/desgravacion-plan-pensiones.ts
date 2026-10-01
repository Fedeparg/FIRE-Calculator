// Desgravación por aportación a un plan de pensiones: ahorro de IRPF al reducir la base general.
// Core puro, orientativo. Art. 52 LIRPF: solo la aportación individual ahorra IRPF. La de la empresa
// se imputa como rendimiento en especie y se reduce de la base por el mismo importe (efecto neto ≈ 0);
// aquí solo entra en el límite conjunto (10.000 €).

import { PENSION_EMPLOYER_LIMIT, PENSION_INDIVIDUAL_LIMIT, PENSION_JOINT_LIMIT } from "../fiscal/brackets.js";
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
  /** Contribución anual de la empresa; no ahorra IRPF, solo eleva el límite conjunto a 10.000 €. Por defecto 0. */
  employerContribution?: number;
  /** Comunidad autónoma (el marginal autonómico varía mucho); sin valor, escala supletoria. */
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
  // El 30 % del rendimiento neto del trabajo limita el conjunto de aportaciones.
  const thirtyPercentCap = base.netWorkIncome * 0.3;

  // Individual: menor entre 1.500 € y el 30 %.
  const individualCap = Math.min(PENSION_INDIVIDUAL_LIMIT, thirtyPercentCap);
  const appliedContribution = Math.min(requested, individualCap);
  const excess = requested - appliedContribution;

  // Empresa: hasta 8.500 €, dentro del límite conjunto de 10.000 € y del 30 %.
  const jointCap = Math.min(PENSION_JOINT_LIMIT, thirtyPercentCap);
  const employerRoom = Math.max(0, Math.min(PENSION_EMPLOYER_LIMIT, jointCap - appliedContribution));
  const employerApplied = Math.min(employerRequested, employerRoom);

  // Solo la aportación individual ahorra IRPF; se usa el mínimo del contribuyente sin circunstancias familiares.
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
