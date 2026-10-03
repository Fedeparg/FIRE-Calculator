"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { itemAt } from "@sextante/core/arrays";
import {
  FINANCIAL_HEALTH_OPTION_SCORES,
  FINANCIAL_HEALTH_QUESTIONS,
  scoreFinancialHealthOptions,
  type HealthCategory,
} from "@sextante/core/calculators/salud-financiera";
import SelectField from "@/shared/ui/SelectField";

import { useOptionFields } from "./CalculatorState";

/** Banner styles per category. */
const CATEGORY_STYLES: Record<HealthCategory, string> = {
  critical: "border-warning-border bg-warning-soft text-warning",
  fragile: "border-warning-border bg-warning-soft text-warning",
  stable: "border-brand bg-brand-soft text-brand",
  strong: "border-accent bg-accent-soft text-accent-text",
};

/**
 * Each question is an option field with its `id` as the URL key and the answer index as the
 * value ("0" = worst): that way the quiz can be shared by link and saved as a scenario, like
 * the other calculators. Module constants: their identity drives registration.
 */
const QUESTION_KEYS = FINANCIAL_HEALTH_QUESTIONS.map((q) => q.id);
const OPTION_VALUES = FINANCIAL_HEALTH_OPTION_SCORES.map((_, index) => String(index));
const FIRST_OPTION = "0";

export default function FinancialHealthQuiz() {
  const t = useTranslations("calc.salud-financiera");

  const [answers, setAnswer] = useOptionFields(QUESTION_KEYS, FIRST_OPTION, OPTION_VALUES);

  const result = useMemo(() => scoreFinancialHealthOptions(answers.map(Number)), [answers]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 content-start">
        {FINANCIAL_HEALTH_QUESTIONS.map((q, i) => (
          <SelectField
            key={q.id}
            label={t(`questions.${q.id}.label`)}
            value={itemAt(answers, i)}
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
          <div className="text-sm opacity-80">{t("scoreMax", { max: 100 })}</div>
        </div>

        <div className={`rounded-xl border p-4 ${CATEGORY_STYLES[result.category]}`}>
          <div className="text-lg font-semibold">{t(`category.${result.category}`)}</div>
          <p className="mt-1 text-sm leading-relaxed">{t(`advice.${result.category}`)}</p>
        </div>
      </div>
    </div>
  );
}
