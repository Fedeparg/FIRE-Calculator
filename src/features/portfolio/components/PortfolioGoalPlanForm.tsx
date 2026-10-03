"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { SCENARIO_NAME_MAX_LENGTH } from "@sextante/core/contracts";
import Button from "@/shared/ui/Button";

type Props = {
  name: string;
  onNameChange: (name: string) => void;
  /** The name matches the loaded plan's: saving updates it instead of creating another one. */
  updating: boolean;
  quotaReached: boolean;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
};

/** Saves the goal as a plan (a FIRE calculator scenario): updates the loaded one or creates a new one. */
export default function PortfolioGoalPlanForm({ name, onNameChange, updating, quotaReached, saving, onSubmit }: Props) {
  const t = useTranslations("portfolio.goal");
  const nameId = useId();
  const ts = useTranslations("calculator.scenarios");

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">{t("scenarioTitle")}</h3>
        <p className="text-xs text-muted">{t("scenarioHint")}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor={nameId} className="text-xs font-medium text-muted">
            {ts("nameLabel")}
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={SCENARIO_NAME_MAX_LENGTH}
            placeholder={ts("namePlaceholder")}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <Button type="submit" disabled={saving || (!updating && quotaReached)}>
          {saving ? ts("saving") : updating ? t("update") : ts("save")}
        </Button>
      </form>

      {!updating && quotaReached && <p className="text-xs text-muted">{ts("quotaReached")}</p>}
    </div>
  );
}
