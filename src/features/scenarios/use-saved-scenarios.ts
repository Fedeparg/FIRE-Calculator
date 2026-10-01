"use client";

import { useState } from "react";

import { activeScenario } from "@/features/portfolio/model/goal-scenario";
import { useApiQuery } from "@/shared/api/use-api-query";
import {
  SCENARIOS_QUERY_INIT,
  classifyScenariosQuery,
  createScenarioRequest,
  deleteScenarioRequest,
  promoteScenario,
  replaceScenario,
  scenarioErrorKey,
  scenariosListPath,
  updateScenarioRequest,
  type SavedScenario,
  type ScenarioErrorKey,
  type ScenarioPatch,
  type ScenariosStatus,
} from "./saved-scenarios";

export type SavedScenariosApi = {
  status: ScenariosStatus;
  scenarios: readonly SavedScenario[];
  /** Plan activo: el de `updatedAt` más reciente (el que enseñan Resumen y avisos). */
  active: SavedScenario | null;
  /** Último fallo (de la carga o de la última acción); se limpia al iniciar la siguiente acción. */
  error: ScenarioErrorKey | null;
  /** Crea y pone el nuevo el primero. `null` si falla (con `error`) o si el nombre está vacío. */
  create: (name: string, inputs: Record<string, unknown>) => Promise<SavedScenario | null>;
  /**
   * PATCH parcial. Por defecto el escenario conserva su posición en la lista; con
   * `promote` pasa a ser el primero (guardar renueva `updatedAt`, o sea, lo activa).
   */
  update: (id: string, patch: ScenarioPatch, options?: { promote?: boolean }) => Promise<SavedScenario | null>;
  /** PATCH vacío: renueva `updatedAt` para que el plan sea el activo, y lo pone primero. */
  activate: (id: string) => Promise<SavedScenario | null>;
  remove: (id: string) => Promise<boolean>;
};

/**
 * CRUD de los escenarios guardados de una calculadora (`slug`) con sus estados de carga y
 * sesión. Sin sesión (401) o sin respuesta, `status` es `anonymous` y el llamador sigue
 * calculando en local. Con `slug` `undefined` no carga (queda en `loading`).
 *
 * La lista se guarda en la consulta y las acciones la corrigen en local (sin recargar) cuando
 * la API confirma; el estado local se descarta si la consulta devuelve datos nuevos.
 */
export function useSavedScenarios(slug: string | undefined): SavedScenariosApi {
  const query = useApiQuery<SavedScenario[]>(slug ? scenariosListPath(slug) : null, {
    init: SCENARIOS_QUERY_INIT,
  });
  const { status, loadError } = classifyScenariosQuery(query);
  const loaded = query.status === "ready" ? query.data : null;

  // Lista corregida a mano, atada a los datos de la consulta de los que parte.
  const [local, setLocal] = useState<{ source: SavedScenario[]; list: SavedScenario[] } | null>(null);
  const scenarios = (local && local.source === loaded ? local.list : loaded) ?? [];

  // `undefined` = aún no hay acciones: se muestra el fallo de la carga, si lo hubo.
  const [actionError, setActionError] = useState<ScenarioErrorKey | null | undefined>(undefined);
  const error = actionError === undefined ? loadError : actionError;

  function applyToList(change: (list: readonly SavedScenario[]) => SavedScenario[]) {
    if (!loaded) return;
    setLocal((prev) => ({ source: loaded, list: change(prev && prev.source === loaded ? prev.list : loaded) }));
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

  /** El backend rechaza nombres vacíos con 400; se evita el viaje. */
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
