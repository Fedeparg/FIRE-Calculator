/**
 * Escenarios guardados de calculadora (`/api/scenarios`): tipos, llamadas y utilidades puras.
 * Sin React ni `server-only`: se carga en el bundle del cliente y se prueba sin DOM. El hook
 * que las orquesta es `useSavedScenarios`. La fuente de verdad es la API
 * (`apps/api/src/scenarios/`), que autoriza y hace el scoping por usuario.
 */

import { ApiError, apiErrorKey, apiJson, type ApiErrorKey } from "@/shared/api/client";
import type { ApiQueryState } from "@/shared/api/use-api-query";

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
 * Error mostrado al guardar/cargar escenarios. Coincide con las claves
 * `calculator.scenarios.error*` de i18n: las comunes más los dos 400 con significado propio.
 */
export type ScenarioErrorKey = ApiErrorKey | "errorTooLarge" | "errorQuota";

/** Códigos de dominio del 400 de `saved-scenarios.service.ts`; el resto de 400 son "revisa el formulario". */
const SCENARIO_ERROR_CODES: Record<string, ScenarioErrorKey> = {
  INPUTS_TOO_LARGE: "errorTooLarge",
  SCENARIO_QUOTA_EXCEEDED: "errorQuota",
};

/** Clave i18n de un fallo de la API de escenarios: primero el código propio, luego el mapeo común. */
export function scenarioErrorKey(error: unknown): ScenarioErrorKey {
  if (error instanceof ApiError && error.code !== undefined) {
    const own = SCENARIO_ERROR_CODES[error.code];
    if (own) return own;
  }
  return apiErrorKey(error);
}

/** Opciones de `fetch` de la lista: siempre fresca (constante de módulo, estable entre renders). */
export const SCENARIOS_QUERY_INIT = { cache: "no-store" } as const;

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
