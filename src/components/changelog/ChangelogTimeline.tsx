"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  availableCategories,
  filterReleases,
  summarizeReleases,
  type ChangelogCategory,
  type ChangelogCategoryFilter,
  type LocalizedChangelogRelease,
} from "@/core/changelog";
import { formatLongDate } from "@/core/format";
import type { Locale } from "@/core/types";

import { CategoryIcon, SparkleIcon } from "./icons";

/**
 * Línea temporal de entregas con filtro por categoría e interruptor de cambios
 * internos.
 *
 * POR QUÉ EL FILTRADO ES DE CLIENTE: la alternativa natural (estado en
 * `searchParams`, filtrado en servidor, funcional sin JavaScript) convertiría la
 * ruta en dinámica y perdería la generación estática + ISR que tiene el resto del
 * sitio. Como contrapartida, el HTML que se prerenderiza es el del estado por
 * defecto — todas las entregas, sin fontanería — así que sin JavaScript la página
 * sigue siendo el changelog completo y legible: solo se pierden los controles.
 *
 * Todos los datos llegan ya validados y resueltos a un idioma desde el servidor
 * (`core/changelog.ts`); aquí no se vuelve a tocar el contenido, solo se filtra.
 */

/**
 * Clases de color por categoría. Tailwind necesita las clases COMPLETAS y
 * literales en el código para poder generarlas, así que este mapa no puede
 * construirse interpolando el identificador de la categoría.
 *
 * El patrón es siempre el mismo: fondo teñido + anillo del color de la categoría,
 * icono coloreado y TEXTO en `text-foreground`. Así el color es redundante (nunca
 * la única pista) y la etiqueta conserva el contraste en claro y en oscuro,
 * que es lo que no ocurriría pintando texto pequeño con los colores de acento.
 */
const CATEGORY_STYLES: Record<ChangelogCategory, { chip: string; icon: string }> = {
  feature: { chip: "bg-brand/12 ring-brand/35", icon: "text-brand" },
  fix: { chip: "bg-success/12 ring-success/35", icon: "text-success" },
  security: { chip: "bg-danger/12 ring-danger/35", icon: "text-danger" },
  performance: { chip: "bg-warning/12 ring-warning/35", icon: "text-warning" },
  milestone: { chip: "bg-milestone/12 ring-milestone/35", icon: "text-milestone" },
  internal: { chip: "bg-muted/12 ring-muted/35", icon: "text-muted" },
};

type Props = {
  /** Entregas ya validadas, localizadas y ordenadas de más reciente a más antigua. */
  releases: LocalizedChangelogRelease[];
  locale: Locale;
};

export default function ChangelogTimeline({ releases, locale }: Props) {
  const t = useTranslations("changelog");
  const [category, setCategory] = useState<ChangelogCategoryFilter>("all");
  const [includeInternal, setIncludeInternal] = useState(false);

  // Corpus visible según el interruptor de internos: de él salen tanto los chips
  // ofrecidos como el resultado final.
  const visible = useMemo(
    () => filterReleases(releases, { category: "all", includeInternal }),
    [releases, includeInternal],
  );
  const categories = useMemo(() => availableCategories(visible), [visible]);

  // Al apagar el interruptor, la categoría seleccionada puede dejar de existir
  // (p. ej. «internos»). Se resuelve de forma DERIVADA, sin efecto ni estado
  // extra: si ya no está disponible, vale «todas» y el chip activo se repinta
  // solo, en vez de dejar al usuario ante una lista vacía sin chip que pulsar.
  const activeCategory: ChangelogCategoryFilter =
    category === "all" || categories.includes(category) ? category : "all";

  const filtered = useMemo(
    () => filterReleases(visible, { category: activeCategory, includeInternal }),
    [visible, activeCategory, includeInternal],
  );

  // El resumen se calcula sobre lo que se está mostrando, así que hace también de
  // contador de resultados del filtro (de ahí el `aria-live`).
  const summary = useMemo(() => summarizeReleases(filtered), [filtered]);

  return (
    <div className="mt-8">
      <dl
        className="grid gap-3 sm:grid-cols-3"
        aria-live="polite"
        aria-label={t("summary.label")}
      >
        <SummaryStat label={t("summary.releases")} value={String(summary.releaseCount)} />
        <SummaryStat label={t("summary.changes")} value={String(summary.changeCount)} />
        <SummaryStat
          label={t("summary.since")}
          value={summary.firstDate ? formatLongDate(summary.firstDate, locale) : "—"}
        />
      </dl>

      <fieldset className="mt-6 rounded-xl border border-border bg-surface p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">{t("filters.legend")}</legend>

        <div className="mt-3 flex flex-wrap gap-2">
          <FilterChip
            label={t("filters.all")}
            active={activeCategory === "all"}
            onClick={() => setCategory("all")}
          />
          {categories.map((id) => (
            <FilterChip
              key={id}
              label={t(`category.${id}`)}
              category={id}
              active={activeCategory === id}
              onClick={() => setCategory(id)}
            />
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2 border-t border-border pt-4">
          <input
            id="changelog-internal"
            type="checkbox"
            checked={includeInternal}
            onChange={(e) => setIncludeInternal(e.target.checked)}
            // `mt-0.5`: alinea la casilla con la PRIMERA línea de la etiqueta,
            // que en móvil ocupa dos.
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <label htmlFor="changelog-internal" className="text-sm text-muted">
            {t("filters.showInternal")}
          </label>
        </div>
      </fieldset>

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-muted">{t("noResults")}</p>
      ) : (
        <ol role="list" className="relative mt-10 space-y-8">
          {filtered.map((release, index) => (
            // La fecha agrupa las entregas, pero nada garantiza que sea única en
            // el JSON: se combina con el índice para que la `key` no colisione.
            <ReleaseItem
              key={`${release.date}-${index}`}
              release={release}
              locale={locale}
              connected={index < filtered.length - 1}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function FilterChip({
  label,
  category,
  active,
  onClick,
}: {
  label: string;
  /** Si se indica, el chip lleva el icono de esa categoría. */
  category?: ChangelogCategory;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? "border-brand bg-brand text-brand-fg"
          : "border-border bg-surface text-muted hover:text-foreground"
      }`}
    >
      {category && (
        <CategoryIcon
          category={category}
          className={`h-3.5 w-3.5 ${active ? "" : CATEGORY_STYLES[category].icon}`}
        />
      )}
      {label}
    </button>
  );
}

function ReleaseItem({
  release,
  locale,
  connected,
}: {
  release: LocalizedChangelogRelease;
  locale: Locale;
  /** `false` en la última entrega: el hilo no debe sobresalir por debajo. */
  connected: boolean;
}) {
  const t = useTranslations("changelog");
  const longDate = formatLongDate(release.date, locale);

  return (
    <li className="relative pl-8 sm:pl-10">
      {/* Nodo de la línea temporal. El nodo ocupa 0-16 px en horizontal (centro en
          8 px) y el hilo va a 7 px, de modo que ambos comparten eje. El hilo se
          dibuja por elemento y llega justo al siguiente (`-bottom-8` = el hueco de
          `space-y-8`), en vez de ser una barra única que sobresaldría por el final. */}
      {connected && (
        <span aria-hidden className="absolute -bottom-8 left-[7px] top-6 w-px bg-border" />
      )}
      <span
        aria-hidden
        className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 ${
          release.highlight ? "border-brand bg-brand" : "border-border bg-surface"
        }`}
      />

      <div
        className={`rounded-xl border p-4 sm:p-5 ${
          release.highlight ? "border-brand bg-brand-soft" : "border-border bg-surface"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Sin titular redactado, la fecha ES el titular: nunca se duplica. */}
          {release.title ? (
            <>
              <time
                dateTime={release.date}
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                {longDate}
              </time>
              {release.highlight && <HighlightBadge label={t("highlight")} />}
            </>
          ) : (
            release.highlight && <HighlightBadge label={t("highlight")} />
          )}
        </div>

        <h2 className="mt-1 text-lg font-semibold text-foreground">
          {release.title ?? <time dateTime={release.date}>{longDate}</time>}
        </h2>

        {release.summary && <p className="mt-2 text-sm text-muted">{release.summary}</p>}

        {release.entries.length > 0 && (
          <ul role="list" className="mt-4 space-y-2.5">
            {release.entries.map((entry) => {
              const styles = CATEGORY_STYLES[entry.category];
              return (
                <li key={entry.hash} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={`inline-flex shrink-0 translate-y-0.5 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ${styles.chip}`}
                  >
                    <CategoryIcon category={entry.category} className={`h-3 w-3 ${styles.icon}`} />
                    {t(`category.${entry.category}`)}
                  </span>
                  {entry.scope && (
                    <span className="shrink-0 font-mono text-xs text-muted">{entry.scope}</span>
                  )}
                  {/* En móvil el texto ocupa su propia línea a ancho completo
                      (`basis-full` dentro de un contenedor `flex-wrap`): compartir
                      línea con la etiqueta dejaría una columna de ~200 px y un
                      párrafo altísimo. A partir de `sm` vuelve a ir en línea.
                      `min-w-0` + `break-words` impiden que una palabra larga
                      ensanche la tarjeta y provoque scroll horizontal. */}
                  <span className="min-w-0 basis-full break-words text-sm text-foreground sm:flex-1 sm:basis-auto">
                    {entry.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}

function HighlightBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-fg">
      <SparkleIcon className="h-3 w-3" />
      {label}
    </span>
  );
}
