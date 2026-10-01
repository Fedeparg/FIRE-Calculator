"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useStoredBoolean } from "@/lib/use-stored-boolean";
import type { Position } from "@/lib/portfolio";
import { ADD_POSITION_ANCHOR } from "./anchors";
import DerivativesSection from "./DerivativesSection";
import PortfolioExport from "./PortfolioExport";
import { usePortfolioData } from "./PortfolioDataProvider";
import PositionDetail from "./PositionDetail";
import PositionForm from "./PositionForm";
import PositionList from "./PositionList";

/** Pestaña Posiciones: la lista, su detalle y el alta/edición. */
export default function PortfolioPositionsTab() {
  const t = useTranslations("portfolio");
  const { positions, setPositions, refresh, prices, rates, display, pendingIds } =
    usePortfolioData();
  // Posición en edición (null = modo alta) y posición con el detalle abierto. Se guardan por id
  // y se derivan de `positions`: así, cuando `refresh()` trae la cantidad y el precio medio
  // reagregados, o una posición desaparece porque la borró otro cliente (MCP), todo cuadra solo.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Preferencia por visor: las posiciones vendidas del todo (cantidad 0) se ocultan por defecto.
  const [showClosed, setShowClosed] = useStoredBoolean("sextante.portfolio.showClosed");

  const editing = positions.find((p) => p.id === editingId) ?? null;
  const detail = positions.find((p) => p.id === detailId) ?? null;

  // Lo valorable (todo menos derivados) y los derivados, por separado. Las cerradas siguen en
  // `positions` con sus lotes —el informe de plusvalías las necesita—: solo se ocultan aquí.
  const tracked = useMemo(() => positions.filter((p) => !p.isDerivative), [positions]);
  const derivatives = useMemo(() => positions.filter((p) => p.isDerivative), [positions]);
  const visible = (list: Position[]) => (showClosed ? list : list.filter((p) => p.quantity > 0));
  const listed = visible(tracked);
  const listedDerivatives = visible(derivatives);
  const closedCount = positions.filter((p) => p.quantity === 0).length;

  function handleCreated(position: Position) {
    // Más recientes primero, igual que el orden del backend.
    setPositions((prev) => [position, ...prev]);
  }

  // Reemplaza una posición existente (edición o combinación) por su versión actualizada.
  function handleSaved(position: Position) {
    setPositions((prev) => prev.map((p) => (p.id === position.id ? position : p)));
    setEditingId(null);
  }

  function handleDeleted(id: string) {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }

  const listProps = {
    prices,
    rates,
    editingId,
    detailId,
    onEdit: (position: Position) => setEditingId(position.id),
    onToggleDetail: (id: string) => setDetailId((cur) => (cur === id ? null : id)),
    onDeleted: handleDeleted,
    pendingIds,
  };

  return (
    <div className="flex flex-col gap-6">
      {positions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-foreground">{t("empty.title")}</p>
          <p className="mt-1 text-sm text-muted">{t("empty.body")}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {closedCount > 0 ? (
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={showClosed}
                  onChange={(e) => setShowClosed(e.target.checked)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                {t("closed.toggle", { count: closedCount })}
              </label>
            ) : (
              <span />
            )}
            <PortfolioExport positions={positions} prices={prices} rates={rates} display={display} />
          </div>

          {listed.length > 0 && <PositionList positions={listed} {...listProps} />}
          {listedDerivatives.length > 0 && (
            <DerivativesSection count={listedDerivatives.length}>
              <PositionList positions={listedDerivatives} {...listProps} />
            </DerivativesSection>
          )}
          {detail && (
            <PositionDetail
              // Al cambiar de posición se remonta: el histórico y la simulación parten de cero.
              key={detail.id}
              position={detail}
              price={prices[detail.ticker]}
              rates={rates}
              onClose={() => setDetailId(null)}
              onMutated={refresh}
            />
          )}
        </>
      )}

      <section id={ADD_POSITION_ANCHOR} className="scroll-mt-6">
        {/* El `key` fuerza un remount al cambiar de posición editada (o volver a alta),
            así el formulario parte siempre del estado inicial correcto. */}
        <PositionForm
          key={editing?.id ?? "add"}
          editing={editing}
          onCreated={handleCreated}
          onSaved={handleSaved}
          onCancelEdit={() => setEditingId(null)}
        />
      </section>
    </div>
  );
}
