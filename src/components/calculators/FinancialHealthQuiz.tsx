"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FINANCIAL_HEALTH_OPTION_SCORES,
  FINANCIAL_HEALTH_QUESTIONS,
  scoreFinancialHealthOptions,
  type HealthCategory,
} from "@sextante/core/calculators/salud-financiera";
import SelectField from "../ui/SelectField";

/** Estilos del banner según categoría. */
const CATEGORY_STYLES: Record<HealthCategory, string> = {
  critical: "border-warning-border bg-warning-soft text-warning",
  fragile: "border-warning-border bg-warning-soft text-warning",
  stable: "border-brand bg-brand-soft text-brand",
  strong: "border-accent bg-accent-soft text-accent",
};

export default function FinancialHealthQuiz() {
  const t = useTranslations("calc.salud-financiera");

  const [answers, setAnswers] = useState<number[]>(() =>
    FINANCIAL_HEALTH_QUESTIONS.map(() => 0),
  );

  const result = useMemo(
    () => scoreFinancialHealthOptions(answers),
    [answers],
  );

  function setAnswer(index: number, value: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = Number(value);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 content-start">
        {FINANCIAL_HEALTH_QUESTIONS.map((q, i) => (
          <SelectField
            key={q.id}
            label={t(`questions.${q.id}.label`)}
            value={String(answers[i])}
            onChange={(v) => setAnswer(i, v)}
            options={FINANCIAL_HEALTH_OPTION_SCORES.map((_, oi) => ({
              value: String(oi),
              label: t(`questions.${q.id}.o${oi}`),
            }))}
          />
        ))}
      </div>

      <div className="grid gap-4 content-start">
        <div className="rounded-xl border border-brand bg-brand-soft p-6 text-center text-brand">
          <div className="text-sm font-medium opacity-80">{t("score")}</div>
          <div className="mt-1 text-5xl font-bold">{result.score}</div>
          <div className="text-sm opacity-80">/ 100</div>
        </div>

        <div className={`rounded-xl border p-4 ${CATEGORY_STYLES[result.category]}`}>
          <div className="text-lg font-semibold">{t(`category.${result.category}`)}</div>
          <p className="mt-1 text-sm leading-relaxed">{t(`advice.${result.category}`)}</p>
        </div>
      </div>
    </div>
  );
}
