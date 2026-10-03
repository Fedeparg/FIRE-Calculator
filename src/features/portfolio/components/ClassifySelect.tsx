"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ASSET_CLASSES, type AssetClass } from "@sextante/core/portfolio/types";
import { setAssetClass } from "@/features/portfolio/api";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { inputClass } from "@/shared/ui/field-classes";

/** Classifies in place a position with no asset class; on save, the page is recomputed. */
export default function ClassifySelect({ positionId, ticker }: { positionId: string; ticker: string }) {
  const t = useTranslations("portfolio.realisedGains");
  const router = useRouter();
  // Controlled: after a failure it goes back to the placeholder instead of showing a class that
  // was not saved.
  const [selected, setSelected] = useState<AssetClass | "">("");
  const save = useApiMutation();
  // The refresh runs in a transition: the select stays busy until the sale moves to its new block.
  const [refreshing, startTransition] = useTransition();

  async function classify(value: AssetClass) {
    setSelected(value);
    const result = await save.run(() => setAssetClass(positionId, value));
    if (result.ok) startTransition(() => router.refresh());
    else setSelected("");
  }

  return (
    <span className="mt-1 flex flex-col gap-1 print:hidden">
      <select
        aria-label={t("classifyLabel", { ticker })}
        value={selected}
        disabled={save.status === "pending" || refreshing}
        onChange={(e) => void classify(e.target.value as AssetClass)}
        className={`${inputClass} h-8 text-xs`}
      >
        <option value="" disabled>
          {t("classifyPlaceholder")}
        </option>
        {ASSET_CLASSES.map((value) => (
          <option key={value} value={value}>
            {t(`assetClasses.${value}`)}
          </option>
        ))}
      </select>
      {save.status === "error" && <span className="text-xs text-warning">{t("classifyError")}</span>}
    </span>
  );
}
