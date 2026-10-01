"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  countByFilter,
  matchesQuery,
  positionFilterOf,
  POSITION_FILTERS,
  type PositionFilter,
} from "@/core/portfolio-positions";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Position } from "@sextante/core/portfolio/types";
import { ADD_POSITION_PARAM } from "../add-position";
import DerivativesNotice from "./DerivativesNotice";
import PortfolioExport from "./PortfolioExport";
import { usePortfolioData } from "./PortfolioDataProvider";
import PositionDetail, { POSITION_DETAIL_TITLE_ID } from "./PositionDetail";
import PositionForm, { POSITION_FORM_TITLE_ID } from "./PositionForm";
import PositionList from "./PositionList";
import PositionPanel from "./PositionPanel";

/** Id del panel lateral (lo referencian las filas con `aria-controls`). */
const PANEL_ID = "position-panel";

/** Qué muestra el panel lateral. */
type PanelState = { kind: "closed" } | { kind: "detail"; id: string } | { kind: "add" } | { kind: "edit"; id: string };

/**
 * Pestaña Posiciones: buscador y filtro pegados a la lista, y un panel para el detalle, el alta
 * y la edición. El panel se abre JUNTO a la fila en escritorio y como hoja inferior en móvil, en
 * vez de debajo de toda la tabla o al final de la página.
 */
export default function PortfolioPositionsTab() {
  const t = useTranslations("portfolio");
  const { positions, setPositions, refresh, prices, rates, display, agg, pendingIds } = usePortfolioData();
  const [filter, setFilter] = useState<PositionFilter>("open");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<PanelState>({ kind: "closed" });

  // "Añadir posición" de la cabecera llega con `?nueva=1`: abre el alta y limpia la URL, para
  // que recargar o volver atrás no la reabra.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const addRequested = searchParams.get(ADD_POSITION_PARAM) === "1";
  // Se ajusta el estado DURANTE el render al ver el parámetro (el patrón de React para
  // "estado que depende de una prop"), no en un efecto: así no hay un render intermedio con
  // el panel cerrado. `seenAdd` evita reabrirlo mientras la URL aún no se ha limpiado.
  const [seenAdd, setSeenAdd] = useState(false);
  if (addRequested !== seenAdd) {
    setSeenAdd(addRequested);
    if (addRequested) setPanel({ kind: "add" });
  }
  useEffect(() => {
    if (addRequested) router.replace(pathname, { scroll: false });
  }, [addRequested, pathname, router]);

  const counts = useMemo(() => countByFilter(positions), [positions]);
  const listed = useMemo(
    () => positions.filter((p) => positionFilterOf(p) === filter && matchesQuery(p, query)),
    [positions, filter, query],
  );

  // El panel guarda ids, no posiciones: así, cuando `refresh()` trae la cantidad y el precio
  // medio reagregados, o la posición desaparece porque la borró otro cliente (MCP), cuadra solo.
  const selected =
    panel.kind === "detail" || panel.kind === "edit" ? (positions.find((p) => p.id === panel.id) ?? null) : null;
  const panelOpen = panel.kind === "add" || selected !== null;

  const closePanel = useCallback(() => setPanel({ kind: "closed" }), []);

  function handleCreated(position: Position) {
    // Más recientes primero, igual que el orden del backend. Se abre su detalle: es lo que
    // se quiere ver justo después de darla de alta.
    setPositions((prev) => [position, ...prev]);
    setPanel({ kind: "detail", id: position.id });
  }

  // Edición o combinación: reemplaza la posición y vuelve a su detalle.
  function handleSaved(position: Position) {
    setPositions((prev) => prev.map((p) => (p.id === position.id ? position : p)));
    setPanel({ kind: "detail", id: position.id });
  }

  function handleDeleted(id: string) {
    setPositions((prev) => prev.filter((p) => p.id !== id));
    setPanel({ kind: "closed" });
  }

  return (
    <div className={`grid grid-cols-1 items-start gap-6 ${panelOpen ? "lg:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
      <div className="flex min-w-0 flex-col gap-4">
        {positions.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="text-foreground">{t("empty.title")}</p>
            <p className="mt-1 text-sm text-muted">{t("empty.body")}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block">
                  <span className="sr-only">{t("positions.searchLabel")}</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("positions.searchPlaceholder")}
                    className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 sm:w-72"
                  />
                </label>
                <div role="group" aria-label={t("positions.filterLabel")} className="flex rounded-xl bg-surface-2 p-1">
                  {POSITION_FILTERS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFilter(option)}
                      aria-pressed={filter === option}
                      className={`h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-sm transition sm:flex-none ${
                        filter === option
                          ? "bg-surface font-semibold text-foreground shadow-sm"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {t(`positions.filter.${option}`)} <span className="tabular-nums">{counts[option]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <PortfolioExport positions={positions} prices={prices} rates={rates} display={display} />
            </div>

            {filter === "derivatives" && counts.derivatives > 0 && <DerivativesNotice />}

            {listed.length > 0 ? (
              <PositionList
                positions={listed}
                prices={prices}
                rates={rates}
                display={display}
                total={agg.marketValue}
                selectedId={selected?.id ?? null}
                onSelect={(id) =>
                  setPanel((cur) =>
                    cur.kind === "detail" && cur.id === id ? { kind: "closed" } : { kind: "detail", id },
                  )
                }
                pendingIds={pendingIds}
                panelId={PANEL_ID}
              />
            ) : (
              <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
                {query.trim() ? t("positions.noMatches") : t(`positions.empty.${filter}`)}
              </p>
            )}
          </>
        )}
      </div>

      {panel.kind === "add" && (
        <PositionPanel id={PANEL_ID} labelledBy={POSITION_FORM_TITLE_ID} onClose={closePanel}>
          <PositionForm editing={null} onCreated={handleCreated} onSaved={handleSaved} onCancelEdit={closePanel} />
        </PositionPanel>
      )}
      {panel.kind === "edit" && selected && (
        <PositionPanel id={PANEL_ID} labelledBy={POSITION_FORM_TITLE_ID} onClose={closePanel}>
          <PositionForm
            key={selected.id}
            editing={selected}
            onCreated={handleCreated}
            onSaved={handleSaved}
            onCancelEdit={() => setPanel({ kind: "detail", id: selected.id })}
          />
        </PositionPanel>
      )}
      {panel.kind === "detail" && selected && (
        <PositionPanel id={PANEL_ID} labelledBy={POSITION_DETAIL_TITLE_ID} onClose={closePanel}>
          <PositionDetail
            // Al cambiar de posición se remonta: las operaciones y la simulación parten de cero.
            key={selected.id}
            position={selected}
            price={prices[selected.ticker]}
            rates={rates}
            pricePending={pendingIds.has(selected.id)}
            onMutated={refresh}
            onEdit={() => setPanel({ kind: "edit", id: selected.id })}
            onDeleted={handleDeleted}
          />
        </PositionPanel>
      )}
    </div>
  );
}
