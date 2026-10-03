"use client";

import { useTranslations } from "next-intl";

import { incomeDefaultsFor } from "@sextante/core/portfolio/isin";
import type { Position } from "@sextante/core/portfolio/types";
import type { usePositionIncome } from "@/features/portfolio/use-position-income";
import IncomeManager from "./IncomeManager";

type Props = {
  position: Position;
  /** Cobros y mutaciones de `usePositionIncome` (los carga el detalle al abrirse). */
  income: ReturnType<typeof usePositionIncome>;
};

/** Vista "Cobros" del detalle: dividendos de la posición, con su carga y su formulario. */
export default function PositionIncomeView({ position, income }: Props) {
  const t = useTranslations("portfolio.detail");

  if (income.loadState === "loading") return <p className="text-sm text-muted">{t("incomeLoading")}</p>;
  if (income.loadState === "error") return <p className="text-sm text-warning">{t("incomeLoadError")}</p>;
  return (
    <IncomeManager
      income={income.income}
      defaults={incomeDefaultsFor(position)}
      submitting={income.submitting}
      errorKey={income.errorKey}
      save={income.save}
      remove={income.remove}
    />
  );
}
