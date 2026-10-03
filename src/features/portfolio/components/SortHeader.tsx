"use client";

import { useTranslations } from "next-intl";

import type { SortDir, SortKey } from "@/features/portfolio/model/sort";

/**
 * Cabecera de columna ordenable. No es un `<th>` (la lista no es una tabla), así que el estado
 * de la ordenación no va en `aria-sort`: va en el nombre accesible del botón.
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
