"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { FxRates, PriceInfo, Position } from "@/lib/portfolio";
import PositionForm from "./PositionForm";
import PositionList from "./PositionList";
import PortfolioSummary from "./PortfolioSummary";

type Props = {
  initialPositions: Position[];
};

/**
 * Island de cliente de la cartera: mantiene la lista en estado y la actualiza sin
 * recargar al añadir, editar, combinar o borrar. La carga inicial (SSR) llega por props
 * desde el server component; la autorización y el scoping por usuario los decide siempre
 * la API.
 */
export default function PortfolioClient({ initialPositions }: Props) {
  const t = useTranslations("portfolio");
  const [positions, setPositions] = useState<Position[]>(initialPositions);
  // Posición en edición (null = modo alta).
  const [editing, setEditing] = useState<Position | null>(null);
  // Últimos precios conocidos por ticker (desde nuestra DB, nunca de la API externa).
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  // Tasas FX para el total agregado (global, no dependen de las posiciones).
  const [fxRates, setFxRates] = useState<FxRates | null>(null);

  // Clave estable de los tickers distintos: solo re-pedimos precios si el CONJUNTO cambia
  // (no al editar cantidad/precio medio). Es justo el `?symbols=` que espera la API.
  const tickersKey = useMemo(
    () => [...new Set(positions.map((p) => p.ticker))].sort().join(","),
    [positions],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!tickersKey) {
        if (!cancelled) setPrices({});
        return;
      }
      try {
        const res = await fetch(`/api/prices?symbols=${encodeURIComponent(tickersKey)}`);
        const data: Record<string, PriceInfo> = res.ok ? await res.json() : {};
        if (!cancelled) setPrices(data);
      } catch {
        // Los precios son enriquecimiento: si fallan, la cartera sigue usable (P&L "—").
        if (!cancelled) setPrices({});
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tickersKey]);

  // Tasas FX: una sola carga (son globales y cambian poco; el total las usa para convertir).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/prices/fx");
        const data: FxRates = res.ok ? await res.json() : { rates: {}, asOf: null };
        if (!cancelled) setFxRates(data);
      } catch {
        if (!cancelled) setFxRates({ rates: {}, asOf: null });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-sincroniza la lista con el servidor (fuente de verdad). Necesario cuando un cliente
  // externo cambia la cartera sin pasar por esta pestaña: típicamente Claude/ChatGPT vía MCP.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/positions", { cache: "no-store" });
      if (!res.ok) return;
      const data: Position[] = await res.json();
      setPositions(data);
      // Si la posición en edición ya no existe (borrada fuera), salimos del modo edición.
      setEditing((cur) => (cur && data.some((p) => p.id === cur.id) ? cur : null));
    } catch {
      // Re-sincronización oportunista: si falla, la pestaña sigue con lo que tenía.
    }
  }, []);

  // Auto-refresco de bajo coste: revalida al volver a la pestaña (caso típico: le pides a
  // Claude que añada algo y vuelves aquí) y con un sondeo lento que SOLO corre con la
  // pestaña visible (en segundo plano no consume nada).
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    const interval = setInterval(refreshIfVisible, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
      clearInterval(interval);
    };
  }, [refresh]);

  function handleCreated(position: Position) {
    // Más recientes primero, igual que el orden del backend.
    setPositions((prev) => [position, ...prev]);
  }

  // Reemplaza una posición existente (edición o combinación) por su versión actualizada.
  function handleSaved(position: Position) {
    setPositions((prev) => prev.map((p) => (p.id === position.id ? position : p)));
    setEditing(null);
  }

  function handleDeleted(id: string) {
    setPositions((prev) => prev.filter((p) => p.id !== id));
    // Si estábamos editando la que se borra, salimos del modo edición.
    setEditing((cur) => (cur?.id === id ? null : cur));
  }

  return (
    <div className="flex flex-col gap-6">
      {positions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-foreground">{t("empty.title")}</p>
          <p className="mt-1 text-sm text-muted">{t("empty.body")}</p>
        </div>
      ) : (
        <>
          <PortfolioSummary positions={positions} prices={prices} fxRates={fxRates} />
          <PositionList
            positions={positions}
            prices={prices}
            editingId={editing?.id ?? null}
            onEdit={setEditing}
            onDeleted={handleDeleted}
          />
        </>
      )}

      {/* El `key` fuerza un remount al cambiar de posición editada (o volver a alta),
          así el formulario parte siempre del estado inicial correcto. */}
      <PositionForm
        key={editing?.id ?? "add"}
        editing={editing}
        onCreated={handleCreated}
        onSaved={handleSaved}
        onCancelEdit={() => setEditing(null)}
      />
    </div>
  );
}
