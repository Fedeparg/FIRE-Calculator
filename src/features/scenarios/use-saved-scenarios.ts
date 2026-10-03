"use client";

import { useState } from "react";

import { NO_STORE } from "@/shared/api/client";
import { useApiQuery } from "@/shared/api/use-api-query";
import {
  activeScenario,
  applyScenarioChange,
  classifyScenariosQuery,
  createScenarioRequest,
  currentScenarios,
  deleteScenarioRequest,
  promoteScenario,
  replaceScenario,
  scenarioErrorKey,
  scenariosListPath,
  updateScenarioRequest,
  type LocalScenarios,
  type SavedScenario,
  type ScenarioErrorKey,
  type ScenarioPatch,
  type ScenariosStatus,
} from "./saved-scenarios";

export type SavedScenariosApi = {
  status: ScenariosStatus;
  scenarios: readonly SavedScenario[];
  /** Active plan: the one with the latest `updatedAt` (the one Summary and alerts show). */
  active: SavedScenario | null;
  /** Last failure (from loading or the last action); cleared when the next action starts. */
  error: ScenarioErrorKey | null;
  /** Creates a scenario and puts it first. `null` on failure (with `error`) or if the name is empty. */
  create: (name: string, inputs: Record<string, unknown>) => Promise<SavedScenario | null>;
  /**
   * Partial PATCH. By default the scenario keeps its position in the list; with `promote` it
   * moves to the front (saving bumps `updatedAt`, which activates it).
   */
  update: (id: string, patch: ScenarioPatch, options?: { promote?: boolean }) => Promise<SavedScenario | null>;
  /** Empty PATCH: bumps `updatedAt` so the plan becomes the active one, and moves it first. */
  activate: (id: string) => Promise<SavedScenario | null>;
  remove: (id: string) => Promise<boolean>;
};

/**
 * CRUD for a calculator's (`slug`) saved scenarios, with their loading and session states.
 * Without a session (401) or without a response, `status` is `anonymous` and the caller keeps
 * computing locally. With an `undefined` `slug` nothing loads (it stays in `loading`).
 *
 * The list lives in the query and actions patch it locally (without refetching) once the API
 * confirms; the local state is discarded if the query returns new data.
 */
export function useSavedScenarios(slug: string | undefined): SavedScenariosApi {
  const query = useApiQuery<SavedScenario[]>(slug ? scenariosListPath(slug) : null, {
    init: NO_STORE,
  });
  const { status, loadError } = classifyScenariosQuery(query);
  const loaded = query.status === "ready" ? query.data : null;

  // List patched by hand, tied to the query data it started from.
  const [local, setLocal] = useState<LocalScenarios | null>(null);
  const scenarios = currentScenarios(local, loaded);

  // `undefined` = no actions yet: show the loading failure, if any.
  const [actionError, setActionError] = useState<ScenarioErrorKey | null | undefined>(undefined);
  const error = actionError === undefined ? loadError : actionError;

  function applyToList(change: (list: readonly SavedScenario[]) => SavedScenario[]) {
    if (!loaded) return;
    setLocal((prev) => applyScenarioChange(prev, loaded, change));
  }

  async function run<T>(request: () => Promise<T>): Promise<T | null> {
    setActionError(null);
    try {
      return await request();
    } catch (failure) {
      setActionError(scenarioErrorKey(failure));
      return null;
    }
  }

  /** The backend rejects empty names with a 400; skip the round trip. */
  function rejectEmptyName(name: string | undefined): boolean {
    if (name === undefined || name.trim() !== "") return false;
    setActionError("errorInvalid");
    return true;
  }

  async function create(name: string, inputs: Record<string, unknown>) {
    if (!slug || rejectEmptyName(name)) return null;
    const created = await run(() => createScenarioRequest(slug, name.trim(), inputs));
    if (created) applyToList((list) => promoteScenario(list, created));
    return created;
  }

  async function update(id: string, patch: ScenarioPatch, options?: { promote?: boolean }) {
    if (rejectEmptyName(patch.name)) return null;
    const body = patch.name === undefined ? patch : { ...patch, name: patch.name.trim() };
    const updated = await run(() => updateScenarioRequest(id, body));
    if (updated) {
      applyToList((list) => (options?.promote ? promoteScenario(list, updated) : replaceScenario(list, updated)));
    }
    return updated;
  }

  const activate = (id: string) => update(id, {}, { promote: true });

  async function remove(id: string) {
    const done = await run(async () => {
      await deleteScenarioRequest(id);
      return true;
    });
    if (done) applyToList((list) => list.filter((s) => s.id !== id));
    return done === true;
  }

  return { status, scenarios, active: activeScenario(scenarios), error, create, update, activate, remove };
}
