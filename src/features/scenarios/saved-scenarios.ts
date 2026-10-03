/**
 * Escenarios guardados de calculadora (`/api/scenarios`): tipos, llamadas y utilidades puras.
 * Sin React ni `server-only`: se carga en el bundle del cliente y se prueba sin DOM. El hook
 * que las orquesta es `useSavedScenarios`. La fuente de verdad es la API
 * (`apps/api/src/scenarios/`), que autoriza y hace el scoping por usuario.
 */

import type { SavedScenarioResponse } from "@sextante/core/contracts";
import { apiJson, createApiErrorMapper } from "@/shared/api/client";
import type { ApiQueryState } from "@/shared/api/use-api-query";

/** Un escenario tal y como lo devuelve `GET /api/scenarios` (fechas como ISO string). */
export type SavedScenario = SavedScenarioResponse;

/**
 * Clave i18n de un fallo de la API de escenarios (`calculator.scenarios.error*`): las comunes
 * más los dos 400 de dominio de `saved-scenarios.service.ts`; el resto de 400 son "revisa el
 * formulario".
 */
export const scenarioErrorKey = createApiErrorMapper({
  codes: { INPUTS_TOO_LARGE: "errorTooLarge", SCENARIO_QUOTA_EXCEEDED: "errorQuota" },
  invalidFallback: "errorInvalid",
});

export type ScenarioErrorKey = ReturnType<typeof scenarioErrorKey>;

export function scenariosListPath(slug: string): string {
  return `/api/scenarios?slug=${encodeURIComponent(slug)}`;
}

/**
 * Qué se sabe tras pedir la lista:
 * - `loading`: aún sin respuesta.
 * - `ready`: hay sesión y la lista llegó.
 * - `anonymous`: 401 (sin sesión) o sin respuesta. Sin respuesta no se puede afirmar que haya
 *   sesión, así que se trata como anónimo y la calculadora sigue en local.
 * - `error`: hay sesión pero la API falló (5xx, etc.); `loadError` trae la clave a mostrar.
 */
export type ScenariosStatus = "loading" | "ready" | "anonymous" | "error";

export function classifyScenariosQuery(state: ApiQueryState<SavedScenario[]>): {
  status: ScenariosStatus;
  loadError: ScenarioErrorKey | null;
} {
  if (state.status === "loading") return { status: "loading", loadError: null };
  if (state.status === "ready") return { status: "ready", loadError: null };
  if (state.error.isNetwork || state.error.status === 401) return { status: "anonymous", loadError: null };
  return { status: "error", loadError: scenarioErrorKey(state.error) };
}

export type ScenarioPatch = { name?: string; inputs?: Record<string, unknown> };

export function createScenarioRequest(
  slug: string,
  name: string,
  inputs: Record<string, unknown>,
): Promise<SavedScenario> {
  return apiJson<SavedScenario>("/api/scenarios", { method: "POST", body: { slug, name, inputs } });
}

/** PATCH parcial. Un `patch` vacío no cambia nada pero renueva `updatedAt`: así se "activa" un plan. */
export function updateScenarioRequest(id: string, patch: ScenarioPatch): Promise<SavedScenario> {
  return apiJson<SavedScenario>(`/api/scenarios/${id}`, { method: "PATCH", body: patch });
}

export function deleteScenarioRequest(id: string): Promise<void> {
  return apiJson<void>(`/api/scenarios/${id}`, { method: "DELETE" });
}

/** Pone `scenario` el primero (sustituyendo su versión anterior): guardar renueva `updatedAt` y el backend ordena así. */
export function promoteScenario(list: readonly SavedScenario[], scenario: SavedScenario): SavedScenario[] {
  return [scenario, ...list.filter((s) => s.id !== scenario.id)];
}

/** Sustituye un escenario conservando su posición. */
export function replaceScenario(list: readonly SavedScenario[], scenario: SavedScenario): SavedScenario[] {
  return list.map((s) => (s.id === scenario.id ? scenario : s));
}

/**
 * Lista corregida a mano tras una acción, atada a los datos de la consulta (`source`) de los que
 * parte: cuando la consulta devuelve datos nuevos (otro array), la corrección se descarta.
 */
export type LocalScenarios = { source: SavedScenario[]; list: SavedScenario[] };

/** Lista a mostrar: la corregida si sigue vigente respecto a `loaded`, y si no la cargada. */
export function currentScenarios(local: LocalScenarios | null, loaded: SavedScenario[] | null): SavedScenario[] {
  return (local && local.source === loaded ? local.list : loaded) ?? [];
}

/** Aplica `change` sobre la lista vigente y devuelve el nuevo estado local, atado a `loaded`. */
export function applyScenarioChange(
  prev: LocalScenarios | null,
  loaded: SavedScenario[],
  change: (list: readonly SavedScenario[]) => SavedScenario[],
): LocalScenarios {
  return { source: loaded, list: change(prev && prev.source === loaded ? prev.list : loaded) };
}

/**
 * Plan activo entre los escenarios FIRE guardados: el actualizado más recientemente. Es la
 * misma regla que siguen los avisos de hitos de la API, así que Resumen, Objetivo y avisos
 * miran siempre el mismo plan. Elegir otro plan lo "toca" (PATCH sin cambios) para activarlo.
 */
export function activeScenario<T extends { updatedAt: string }>(scenarios: readonly T[]): T | null {
  let active: T | null = null;
  for (const scenario of scenarios) {
    if (active === null || Date.parse(scenario.updatedAt) > Date.parse(active.updatedAt)) active = scenario;
  }
  return active;
}
