"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { PendingNegative, SavingsGroup } from "@sextante/core/fiscal/savings-base";
import { savePendingBalances } from "@/features/portfolio/api";
import { apiErrorKey, type ApiErrorKey } from "@/shared/api/client";
import { parseDecimalInput, sanitizeDecimalInput } from "@/shared/format/number-input";
import Button from "@/shared/ui/Button";
import { inputClass } from "@/shared/ui/field-classes";

type Row = { key: number; originYear: number; kind: SavingsGroup; amount: string };

type Props = {
  /** Lo guardado. */
  balances: readonly PendingNegative[];
  /** Primer ejercicio que calcula Sextante: los saldos son de los cuatro anteriores. */
  firstYear: number;
};

/**
 * Saldos negativos de la base del ahorro pendientes de compensar que vienen de ejercicios que
 * Sextante no calcula. Se copian del anexo C.3 de la última declaración presentada. Los de los
 * ejercicios que sí calcula se arrastran solos.
 */
export default function PendingBalancesForm({ balances, firstYear }: Props) {
  const t = useTranslations("portfolio.pendingBalances");
  const router = useRouter();
  const uid = useId();
  const years = [1, 2, 3, 4].map((offset) => firstYear - offset);

  const [rows, setRows] = useState<Row[]>(() =>
    balances.map((b, i) => ({ key: i, originYear: b.originYear, kind: b.kind, amount: String(b.amount) })),
  );
  const [nextKey, setNextKey] = useState(balances.length);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [saved, setSaved] = useState(false);

  const parsed = rows.map((row) => ({ ...row, value: parseDecimalInput(row.amount) ?? Number.NaN }));
  const duplicated = new Set(rows.map((r) => `${r.originYear}:${r.kind}`)).size !== rows.length;
  const isValid = !duplicated && parsed.every((row) => Number.isFinite(row.value) && row.value > 0);

  function update(key: number, patch: Partial<Row>) {
    setSaved(false);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    setErrorKey(null);
    try {
      await savePendingBalances(parsed.map(({ originYear, kind, value }) => ({ originYear, kind, amount: value })));
      setSaved(true);
      router.refresh();
    } catch (error) {
      setErrorKey(apiErrorKey(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
        {t("title", { count: balances.length })}
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-4">
        <p className="text-sm text-muted">{t("help", { firstYear })}</p>

        {rows.length > 0 && (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_9rem_auto] sm:items-end">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  {t("originYear")}
                  <select
                    id={`${uid}-year-${row.key}`}
                    value={row.originYear}
                    onChange={(e) => update(row.key, { originYear: Number(e.target.value) })}
                    className={inputClass}
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  {t("kind")}
                  <select
                    id={`${uid}-kind-${row.key}`}
                    value={row.kind}
                    onChange={(e) => update(row.key, { kind: e.target.value as SavingsGroup })}
                    className={inputClass}
                  >
                    <option value="gains">{t("kindGains")}</option>
                    <option value="capitalIncome">{t("kindCapitalIncome")}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  {t("amount")}
                  <input
                    id={`${uid}-amount-${row.key}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.amount}
                    onChange={(e) => update(row.key, { amount: sanitizeDecimalInput(e.target.value) })}
                    placeholder="0"
                    className={inputClass}
                  />
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSaved(false);
                    setRows((current) => current.filter((r) => r.key !== row.key));
                  }}
                >
                  {t("remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {duplicated && <p className="text-sm text-warning">{t("duplicated")}</p>}
        {errorKey && (
          <p role="alert" className="text-sm text-warning">
            {t(errorKey)}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={rows.length >= 8}
            onClick={() => {
              setSaved(false);
              setRows((current) => [...current, { key: nextKey, originYear: years[0], kind: "gains", amount: "" }]);
              setNextKey((k) => k + 1);
            }}
          >
            {t("add")}
          </Button>
          <Button disabled={!isValid || saving} onClick={() => void handleSave()}>
            {saving ? t("saving") : t("save")}
          </Button>
          {saved && <span className="text-sm text-success">{t("saved")}</span>}
        </div>
      </div>
    </details>
  );
}
