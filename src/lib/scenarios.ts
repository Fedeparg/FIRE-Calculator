/**
 * Tipos y límites de los escenarios guardados de calculadora, compartidos por los
 * componentes de cliente. NO debe importar `server-only` ni `next/headers`: se carga en el
 * bundle del cliente. La fuente de verdad es la API (`apps/api/src/scenarios/`).
 */

/** Un escenario tal y como lo devuelve `GET /api/scenarios` (fechas como ISO string). */
export type SavedScenario = {
  id: string;
  slug: string;
  name: string;
  inputs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/**
 * Longitud máxima del nombre. Debe mantenerse EN PARIDAD EXACTA con el `@MaxLength(100)`
 * del backend: aquí solo sirve para que el campo no deje escribir algo que la API
 * rechazaría con un 400.
 */
export const SCENARIO_NAME_MAX_LENGTH = 100;

/**
 * Máximo de escenarios por usuario. Paridad con `MAX_SCENARIOS_PER_USER` del backend, que es
 * quien lo aplica de verdad (aquí solo se usa para avisar antes de intentarlo).
 */
export const MAX_SCENARIOS_PER_USER = 50;

/**
 * Tipo de error mostrado al guardar/cargar escenarios, derivado del fallo concreto (status,
 * código de la API o red). Coincide con las claves `calculator.scenarios.error*` de i18n.
 */
export type ScenarioErrorKey =
  | "errorNetwork"
  | "errorSession"
  | "errorInvalid"
  | "errorServer"
  | "errorGeneric"
  | "errorTooLarge"
  | "errorQuota";

/** Traduce un status HTTP a un mensaje específico (sin volcar el body crudo de la API). */
export function scenarioErrorKeyForStatus(status: number): ScenarioErrorKey {
  if (status === 401) return "errorSession";
  if (status === 400) return "errorInvalid";
  if (status >= 500) return "errorServer";
  return "errorGeneric";
}

/**
 * Los dos 400 con significado propio del backend (`saved-scenarios.service.ts`). El resto de
 * 400 son "revisa el formulario".
 */
export async function scenarioErrorKeyForResponse(res: Response): Promise<ScenarioErrorKey> {
  if (res.status === 400) {
    try {
      const body = (await res.json()) as { code?: string };
      if (body.code === "INPUTS_TOO_LARGE") return "errorTooLarge";
      if (body.code === "SCENARIO_QUOTA_EXCEEDED") return "errorQuota";
    } catch {
      // Un 400 sin cuerpo JSON cae al mensaje genérico de datos inválidos.
    }
  }
  return scenarioErrorKeyForStatus(res.status);
}
