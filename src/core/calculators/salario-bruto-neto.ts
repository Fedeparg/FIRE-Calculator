// Salario bruto → neto. Thin wrapper sobre el motor de IRPF del trabajo.
// Modelo orientativo (ver `core/fiscal/irpf.ts`).

export { estimateNetSalary as computeNetSalary } from "../fiscal/irpf";
export type { NetSalaryInput, NetSalaryResult } from "../fiscal/irpf";
