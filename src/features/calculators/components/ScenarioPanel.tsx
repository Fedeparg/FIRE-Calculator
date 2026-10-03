"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { MAX_SCENARIOS_PER_USER, SCENARIO_NAME_MAX_LENGTH } from "@sextante/core/contracts";
import { trackEvent } from "@/shared/analytics/track";
import { Link } from "@/i18n/navigation";
import { type SavedScenario } from "@/features/scenarios/saved-scenarios";
import { useSavedScenarios } from "@/features/scenarios/use-saved-scenarios";
import { useCalculatorState } from "./CalculatorState";
import { inputClass } from "@/shared/ui/field-classes";
import Button from "@/shared/ui/Button";
import { useApiErrorText } from "@/shared/api/use-api-error-text";

const inputClassSm = `${inputClass} text-sm`;

/**
 * Saved scenarios for the open calculator: save the current state under a name, list them,
 * load, rename and delete them.
 *
 * Session: checked by requesting the list from the API. A 401 means "no session", and the
 * user is then invited to sign in instead of being shown a button that would fail. The
 * client does NOT make the decision: the API authorises each request and scopes by user; this
 * only reflects its response. The check runs on the client on purpose (like `AuthNav`)
 * because reading the cookie on the server would turn the 26 calculator pages, which are
 * static with ISR, into dynamic ones.
 *
 * Loading a scenario is exactly "applying some values": it delegates to the provider's
 * `applyInputs`, the same path the URL uses, so saved `inputs` are validated against the
 * calculator's real fields (a stale or tampered scenario breaks nothing: whatever does not
 * fit falls back to its default value).
 */
export default function ScenarioPanel() {
  const t = useTranslations("calculator.scenarios");
  const errorText = useApiErrorText(t);
  const nameId = useId();
  const state = useCalculatorState();
  const slug = state?.slug;

  // Session and list: the response itself says whether there is a session (401); the `loading`
  // status is the former `unknown` and renders nothing until the API answers.
  const { status, scenarios, error: errorKey, create, update, remove } = useSavedScenarios(slug);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  // Scenario being renamed and the text being typed.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // id awaiting delete confirmation / id being deleted (same pattern as the portfolio).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Name of the scenario just loaded, to announce it in the live region.
  const [loadedName, setLoadedName] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!state || !slug) return;
    setSaving(true);
    // `getInputs()` returns the COMPLETE state (defaults included), not just what was touched:
    // that way the scenario reproduces the whole computation when loaded.
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

  // Nothing renders until we know whether there is a session (avoids the flicker of a panel
  // that appears and disappears), just like the header navigation.
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
          <label htmlFor={nameId} className="text-xs font-medium text-muted">
            {t("nameLabel")}
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={SCENARIO_NAME_MAX_LENGTH}
            placeholder={t("namePlaceholder")}
            autoComplete="off"
            className={`mt-1 ${inputClassSm}`}
          />
        </div>
        <Button type="submit" disabled={saving || quotaReached}>
          {saving ? t("saving") : t("save")}
        </Button>
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
                      className={`min-w-40 flex-1 ${inputClassSm}`}
                    />
                    <Button size="xs" onClick={() => handleRename(scenario.id)}>
                      {t("renameSave")}
                    </Button>
                    <Button variant="secondary" size="xs" onClick={() => setRenamingId(null)}>
                      {t("cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="mr-auto truncate text-sm text-foreground">{scenario.name}</span>
                    {isConfirming ? (
                      <>
                        <Button
                          variant="warning"
                          size="xs"
                          onClick={() => handleDelete(scenario.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? t("deleting") : t("confirmDelete")}
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setConfirmingId(null)}
                          disabled={isDeleting}
                        >
                          {t("cancel")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="accent" size="xs" onClick={() => handleLoad(scenario)}>
                          {t("load")}
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => {
                            setRenamingId(scenario.id);
                            setRenameValue(scenario.name);
                          }}
                        >
                          {t("rename")}
                        </Button>
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

      {/* Loading a scenario changes the fields all at once: it is announced, not just shown. */}
      <p role="status" aria-live="polite" className="sr-only">
        {loadedName ? t("loaded", { name: loadedName }) : ""}
      </p>

      {errorKey && (
        <p className="text-sm text-warning">
          {errorText(errorKey)}
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
