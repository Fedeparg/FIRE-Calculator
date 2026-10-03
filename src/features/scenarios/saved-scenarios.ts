/**
 * Saved calculator scenarios (`/api/scenarios`): types, calls and pure helpers.
 * No React and no `server-only`: it ships in the client bundle and is tested without a DOM. The
 * hook that orchestrates them is `useSavedScenarios`. The source of truth is the API
 * (`apps/api/src/scenarios/`), which handles authorization and per-user scoping.
 */

import type { SavedScenarioResponse } from "@sextante/core/contracts";
import { apiJson, createApiErrorMapper } from "@/shared/api/client";
import type { ApiQueryState } from "@/shared/api/use-api-query";

/** A scenario as returned by `GET /api/scenarios` (dates as ISO strings). */
export type SavedScenario = SavedScenarioResponse;

/**
 * i18n key for a scenarios API failure (`calculator.scenarios.error*`): the common ones plus the
 * two domain 400s from `saved-scenarios.service.ts`; any other 400 means "check the form".
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
 * What is known after requesting the list:
 * - `loading`: no response yet.
 * - `ready`: there is a session and the list arrived.
 * - `anonymous`: 401 (no session) or no response. Without a response we cannot claim there is a
 *   session, so it is treated as anonymous and the calculator keeps working locally.
 * - `error`: there is a session but the API failed (5xx, etc.); `loadError` carries the key to show.
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

/** Partial PATCH. An empty `patch` changes nothing but bumps `updatedAt`: that is how a plan is "activated". */
export function updateScenarioRequest(id: string, patch: ScenarioPatch): Promise<SavedScenario> {
  return apiJson<SavedScenario>(`/api/scenarios/${id}`, { method: "PATCH", body: patch });
}

export function deleteScenarioRequest(id: string): Promise<void> {
  return apiJson<void>(`/api/scenarios/${id}`, { method: "DELETE" });
}

/** Moves `scenario` to the front (replacing its old version): saving bumps `updatedAt` and the backend sorts that way. */
export function promoteScenario(list: readonly SavedScenario[], scenario: SavedScenario): SavedScenario[] {
  return [scenario, ...list.filter((s) => s.id !== scenario.id)];
}

/** Replaces a scenario, keeping its position. */
export function replaceScenario(list: readonly SavedScenario[], scenario: SavedScenario): SavedScenario[] {
  return list.map((s) => (s.id === scenario.id ? scenario : s));
}

/**
 * List patched by hand after an action, tied to the query data (`source`) it started from: when
 * the query returns new data (a different array), the correction is discarded.
 */
export type LocalScenarios = { source: SavedScenario[]; list: SavedScenario[] };

/** List to show: the corrected one if it is still current for `loaded`, otherwise the loaded one. */
export function currentScenarios(local: LocalScenarios | null, loaded: SavedScenario[] | null): SavedScenario[] {
  return (local && local.source === loaded ? local.list : loaded) ?? [];
}

/** Applies `change` to the current list and returns the new local state, tied to `loaded`. */
export function applyScenarioChange(
  prev: LocalScenarios | null,
  loaded: SavedScenario[],
  change: (list: readonly SavedScenario[]) => SavedScenario[],
): LocalScenarios {
  return { source: loaded, list: change(prev && prev.source === loaded ? prev.list : loaded) };
}

/**
 * Active plan among the saved FIRE scenarios: the most recently updated one. It is the same rule
 * the API's milestone alerts follow, so Summary, Goal and alerts always look at the same plan.
 * Choosing another plan "touches" it (a no-op PATCH) to activate it.
 */
export function activeScenario<T extends { updatedAt: string }>(scenarios: readonly T[]): T | null {
  let active: T | null = null;
  for (const scenario of scenarios) {
    if (active === null || Date.parse(scenario.updatedAt) > Date.parse(active.updatedAt)) active = scenario;
  }
  return active;
}
