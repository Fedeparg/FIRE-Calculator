"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type SelectorItem = {
  slug: string;
  name: string;
  description: string;
  category: string;
  status: "live" | "soon";
  search: string;
};

type Props = {
  items: SelectorItem[];
  categories: { id: string; label: string }[];
};

// Normaliza para que el buscador ignore acentos ("hipoteca" ~ "hipotéca").
// NFD separa la letra de su diacrítico; eliminamos el rango de combinantes
// (U+0300–U+036F).
const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export default function Selector({ items, categories }: Props) {
  const t = useTranslations("selector");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const categoryLabels = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      return normalize(item.search).includes(q);
    });
  }, [items, query, category]);

  return (
    <div className="mt-6">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <CategoryChip active={category === "all"} onClick={() => setCategory("all")} label={t("allCategories")} />
        {categories.map((c) => (
          <CategoryChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)} label={c.label} />
        ))}
      </div>

      <p className="mt-4 text-sm text-muted">{t("resultsCount", { count: filtered.length })}</p>

      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-muted">{t("noResults")}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <li key={item.slug}>
              <Card item={item} categoryLabel={categoryLabels.get(item.category) ?? ""} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Card({ item, categoryLabel }: { item: SelectorItem; categoryLabel: string }) {
  const t = useTranslations("selector");

  const inner = (
    <div
      className={`flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-all ${
        item.status === "live" ? "hover:-translate-y-0.5 hover:border-brand hover:shadow-sm" : "opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{categoryLabel}</span>
        {item.status === "soon" && (
          <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted">{t("soon")}</span>
        )}
      </div>
      <h3 className="mt-2 font-semibold text-foreground">{item.name}</h3>
      <p className="mt-1 flex-1 text-sm text-muted">{item.description}</p>
      {item.status === "live" && <span className="mt-3 text-sm font-medium text-brand">{t("open")} →</span>}
    </div>
  );

  if (item.status === "live") {
    return (
      <Link href={`/calculadoras/${item.slug}`} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}
