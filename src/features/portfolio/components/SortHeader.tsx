"use client";

import { useTranslations } from "next-intl";

import type { SortDir, SortKey } from "@/features/portfolio/model/sort";

/**
 * Sortable column header. It is not a `<th>` (the list is not a table), so the sort state does
 * not go in `aria-sort`: it goes in the button's accessible name.
 */
export default function SortHeader({
  column,
  label,
  align,
  activeKey,
  dir,
  onSort,
}: {
  column: SortKey;
  label: string;
  align: "left" | "right";
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const t = useTranslations("portfolio.list");
  const active = activeKey === column;
  const accessibleName = active
    ? t(dir === "asc" ? "sortedAsc" : "sortedDesc", { field: label })
    : t("sortBy", { field: label });
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={accessibleName}
      className={`inline-flex items-center gap-1 transition hover:text-foreground ${
        align === "right" ? "justify-self-end" : "justify-self-start"
      } ${active ? "text-foreground" : ""}`}
    >
      {label}
      <span aria-hidden="true">{active ? (dir === "asc" ? "↑" : "↓") : ""}</span>
    </button>
  );
}
