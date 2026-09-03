// Desgravación por aportación a un plan de pensiones. Calcula el ahorro fiscal
// real (lo que dejas de pagar de IRPF) al reducir la base imponible general.
// Core puro. Modelo orientativo.
//
// IMPORTANTE (art. 52 LIRPF): solo la aportación INDIVIDUAL genera ahorro de IRPF
// para el trabajador. La contribución de la EMPRESA a un plan de empleo se imputa
// al trabajador como rendimiento del trabajo en especie y, acto seguido, se reduce
// de la base por el mismo importe → su efecto neto en el IRPF del año es ≈ 0. Por
// eso aquí solo sirve para calcular el límite conjunto (10.000 €) y cuánto de tu
// aportación individual cabe; su ventaja es construir patrimonio con diferimiento.

import { PENSION_EMPLOYER_LIMIT, PENSION_INDIVIDUAL_LIMIT, PENSION_JOINT_LIMIT } from "../fiscal/brackets";
import {
  estimateNetSalary,
  generalIncomeTax,
  personalAndFamilyMinimum,
  regionalPersonalAndFamilyMinimum,
} from "../fiscal/irpf";
import type { RegionCode } from "../fiscal/regions";

export interface PensionReliefInput {
  /** Salario bruto anual (para situar el tramo marginal). */
  grossAnnual: number;
  /** Aportación anual individual deseada al plan de pensiones. */
  contribution: number;
  /**
   * Contribución anual de la empresa a un plan de empleo. Por defecto 0. No
   * genera ahorro de IRPF directo; solo eleva el límite conjunto a 10.000 €.
   */
  employerContribution?: number;
  /**
   * Comunidad autónoma de residencia. Cambia el ahorro fiscal porque el marginal
   * autonómico varía mucho entre comunidades. Sin valor: escala supletoria.
   */
  region?: RegionCode;
}

export interface PensionReliefResult {
  /** Aportación individual efectiva tras aplicar el límite legal. */
  appliedContribution: number;
  /** Parte de la aportación individual que excede el límite y no desgrava. */
  excess: number;
  /** Contribución de empresa efectiva tras el límite conjunto (no desgrava por sí misma). */
  employerApplied: number;
  /** Total que reduce la base (individual aplicada + empresa aplicada). */
  totalApplied: number;
  /** Ahorro de IRPF gracias a la aportación individual. */
  taxSaving: number;
  /** Coste real de la aportación individual (aportación − ahorro fiscal). */
  netCost: number;
  /** Porcentaje de la aportación individual que recuperas vía IRPF. */
  savingRate: number;
}

export function computePensionRelief(input: PensionReliefInput): PensionReliefResult {
  const grossAnnual = Math.max(0, input.grossAnnual || 0);
  const requested = Math.max(0, input.contribution || 0);
  const employerRequested = Math.max(0, input.employerContribution || 0);

  const base = estimateNetSalary({ grossAnnual, region: input.region });
  // El 30 % del rendimiento neto del trabajo limita el conjunto de aportaciones.
  const thirtyPercentCap = base.netWorkIncome * 0.3;

  // Aportación individual: menor entre 1.500 € y el 30 % del rendimiento neto.
  const individualCap = Math.min(PENSION_INDIVIDUAL_LIMIT, thirtyPercentCap);
  const appliedContribution = Math.min(requested, individualCap);
  const excess = requested - appliedContribution;

  // Contribución de empresa: incremento de hasta 8.500 €, sujeto al límite
  // conjunto de 10.000 € y al 30 % del rendimiento neto del trabajo.
  const jointCap = Math.min(PENSION_JOINT_LIMIT, thirtyPercentCap);
  const employerRoom = Math.max(0, Math.min(PENSION_EMPLOYER_LIMIT, jointCap - appliedContribution));
  const employerApplied = Math.min(employerRequested, employerRoom);

  // El ahorro de IRPF proviene SOLO de la aportación individual (ver cabecera).
  // Sin circunstancias familiares: se usa el mínimo del contribuyente, estatal y
  // autonómico, que es lo único que se puede deducir del bruto anual.
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
