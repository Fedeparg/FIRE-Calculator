"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { MAX_SCENARIOS_PER_USER, SCENARIO_NAME_MAX_LENGTH } from "@sextante/core/contracts";
import { trackEvent } from "@/shared/analytics/track";
import { Link } from "@/i18n/navigation";
import { type SavedScenario } from "@/features/scenarios/saved-scenarios";
import { useSavedScenarios } from "@/features/scenarios/use-saved-scenarios";
import { useCalculatorState } from "./CalculatorState";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/**
 * Escenarios guardados de la calculadora abierta: guardar el estado actual con un nombre,
 * listarlos, cargarlos, renombrarlos y borrarlos.
 *
 * Sesión: se comprueba pidiendo la lista a la API. Un 401 significa "no hay sesión" y
 * entonces se invita a entrar en vez de enseñar un botón que fallaría. La decisión NO la
 * toma el cliente: la API autoriza cada petición y hace el scoping por usuario; aquí solo
 * se refleja su respuesta. Se comprueba desde el cliente a propósito —como `AuthNav`—
 * porque leer la cookie en el servidor convertiría en dinámicas las 26 páginas de
 * calculadora, que son estáticas con ISR.
 *
 * Cargar un escenario es exactamente "aplicar unos valores": se delega en `applyInputs` del
 * proveedor, el mismo camino que usa la URL, así que los `inputs` guardados se validan
 * contra los campos reales de la calculadora (un escenario obsoleto o manipulado no rompe
 * nada: lo que no encaja cae a su valor por defecto).
 */
export default function ScenarioPanel() {
  const t = useTranslations("calculator.scenarios");
  const state = useCalculatorState();
  const slug = state?.slug;

  // Sesión y lista: la propia respuesta dice si hay sesión (401); el estado `loading` es el
  // `unknown` de antes y no pinta nada hasta que la API contesta.
  const { status, scenarios, error: errorKey, create, update, remove } = useSavedScenarios(slug);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  // Escenario en proceso de renombrado y el texto que se está escribiendo.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // id en confirmación de borrado / id en proceso de borrado (mismo patrón que la cartera).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Nombre del escenario recién cargado, para anunciarlo en la región viva.
  const [loadedName, setLoadedName] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!state || !slug) return;
    setSaving(true);
    // `getInputs()` da el estado COMPLETO (con los valores por defecto), no solo lo que se
    // ha tocado: así el escenario reproduce el cálculo entero al cargarlo.
    const created = await create(name, state.getInputs());
    setSaving(false);
    if (created) {
      setName("");
      trackEvent({ name: "scenario-saved", data: { calculator: slug } });
    }
  }

  async function handleRename(id: string) {
    if (await update(id, { name: renameValue })) setRenamingId(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await remove(id);
    setDeletingId(null);
    setConfirmingId(null);
  }

  function handleLoad(scenario: SavedScenario) {
    state?.applyInputs(scenario.inputs);
    setLoadedName(scenario.name);
  }

  // Mientras no se sepa si hay sesión no se pinta nada (evita el parpadeo de un panel que
  // aparece y desaparece), igual que en la navegación de cabecera.
  if (status === "loading") return null;

  if (status === "anonymous") {
    return (
      <p className="border-t border-border pt-3 text-sm text-muted">
        {t("signedOut")}{" "}
        <Link href="/entrar" className="font-medium text-brand underline underline-offset-2">
          {t("signedOutLink")}
        </Link>
      </p>
    );
  }

  const quotaReached = scenarios.length >= MAX_SCENARIOS_PER_USER;

  return (
    <div className="grid gap-3 border-t border-border pt-3">
      <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>

      <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor="scenario-name" className="text-xs font-medium text-muted">
            {t("nameLabel")}
          </label>
          <input
            id="scenario-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={SCENARIO_NAME_MAX_LENGTH}
            placeholder={t("namePlaceholder")}
            autoComplete="off"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <button
          type="submit"
          disabled={saving || quotaReached}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </form>

      {quotaReached && <p className="text-xs text-muted">{t("quotaReached")}</p>}

      {scenarios.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {scenarios.map((scenario) => {
            const isRenaming = renamingId === scenario.id;
            const isConfirming = confirmingId === scenario.id;
            const isDeleting = deletingId === scenario.id;

            return (
              <li
                key={scenario.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
              >
                {isRenaming ? (
                  <>
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={SCENARIO_NAME_MAX_LENGTH}
                      aria-label={t("renameLabel", { name: scenario.name })}
                      autoComplete="off"
                      className={`min-w-40 flex-1 ${inputClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => handleRename(scenario.id)}
                      className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-brand-fg transition hover:opacity-90"
                    >
                      {t("renameSave")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2"
                    >
                      {t("cancel")}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="mr-auto truncate text-sm text-foreground">{scenario.name}</span>
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDelete(scenario.id)}
                          disabled={isDeleting}
                          className="rounded-md bg-warning px-2.5 py-1 text-xs font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
                        >
                          {isDeleting ? t("deleting") : t("confirmDelete")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          disabled={isDeleting}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
                        >
                          {t("cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleLoad(scenario)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft"
                        >
                          {t("load")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(scenario.id);
                            setRenameValue(scenario.name);
                          }}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2"
                        >
                          {t("rename")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(scenario.id)}
                          aria-label={t("deleteLabel", { name: scenario.name })}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:border-warning hover:text-warning"
                        >
                          {t("delete")}
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Cargar un escenario cambia los campos de golpe: se anuncia, no solo se ve. */}
      <p role="status" aria-live="polite" className="sr-only">
        {loadedName ? t("loaded", { name: loadedName }) : ""}
      </p>

      {errorKey && (
        <p className="text-sm text-warning">
          {t(errorKey)}
          {errorKey === "errorSession" && (
            <>
              {" "}
              <Link href="/entrar" className="font-medium text-brand underline underline-offset-2">
                {t("errorSessionLink")}
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
