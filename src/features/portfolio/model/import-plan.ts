// Resumen de la vista previa de una importación: lo que la pantalla cuenta antes de confirmar.
// Puro (sin React), testeable en node.

import type { ImportPlan } from "@sextante/core/imports/types";

export type ImportPlanSummary = {
  /** Posiciones nuevas que se crearán (sin las bloqueadas). */
  created: number;
  /** Posiciones existentes a las que se añadirán lotes (sin las bloqueadas). */
  extended: number;
  /** Operaciones que se importarán de verdad: compras y ventas nuevas de posiciones no bloqueadas. */
  lotsToImport: number;
  /** Cobros del fichero, nuevos o ya importados: si hay alguno, el fichero no está "vacío". */
  incomeInFile: number;
  /** Hay algo que confirmar (lotes o cobros nuevos). */
  canConfirm: boolean;
};

export function summarisePlan(plan: ImportPlan): ImportPlanSummary {
  const importable = plan.positions.filter((p) => !p.blockedBy);
  const lotsToImport = importable.reduce((sum, p) => sum + p.newBuys + p.newSells, 0);
  return {
    created: importable.filter((p) => p.action === "create").length,
    extended: importable.filter((p) => p.action === "extend").length,
    lotsToImport,
    incomeInFile: plan.income.created + plan.income.duplicates,
    canConfirm: lotsToImport > 0 || plan.income.created > 0,
  };
}
