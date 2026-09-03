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
