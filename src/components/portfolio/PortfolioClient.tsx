"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { aggregatePortfolio } from "@/core/fx";
import { latestFetchedAt } from "@/core/portfolio-prices";
import { useFormat } from "@/lib/format";
import { PORTFOLIO_CURRENCIES, type FxRates, type PriceInfo, type Position } from "@/lib/portfolio";
import PortfolioBreakdown from "./PortfolioBreakdown";
import PortfolioExport from "./PortfolioExport";
import PortfolioGoal from "./PortfolioGoal";
import PortfolioHistoryChart from "./PortfolioHistoryChart";
import PositionDetail from "./PositionDetail";
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
 *
 * La divisa de visualización vive AQUÍ, no en el resumen: la comparten el total, el histórico
 * y la composición, y tener tres selectores independientes daría tres cifras distintas en la
 * misma pantalla.
 */
export default function PortfolioClient({ initialPositions }: Props) {
  const t = useTranslations("portfolio");
  const { currencyLabel } = useFormat();
  const [positions, setPositions] = useState<Position[]>(initialPositions);
  // Posición en edición (null = modo alta).
  const [editing, setEditing] = useState<Position | null>(null);
  // Últimos precios conocidos por ticker (desde nuestra DB, nunca de la API externa).
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  /**
   * Contador que fuerza volver a pedir los precios sin que cambie el conjunto de tickers. Lo
   * sube el auto-refresco: con el refresco intradía del servidor, un precio puede cambiar
   * durante el día y la pestaña abierta tiene que enterarse. Es una lectura de NUESTRA base de
   * datos, nunca de la fuente externa, así que repetirla es barato.
   */
  const [priceTick, setPriceTick] = useState(0);
  /**
   * Cuándo se recibieron los precios (ms). Es el "ahora" contra el que se calcula el
   * "actualizado hace…": se fija al llegar la respuesta, no al pintar, porque leer el reloj
   * durante el render lo haría impuro. Como el auto-refresco vuelve a pedirlos, no envejece.
   */
  const [pricesCheckedAt, setPricesCheckedAt] = useState<number | null>(null);
  // Tasas FX para el total agregado (global, no dependen de las posiciones).
  const [fxRates, setFxRates] = useState<FxRates | null>(null);
  // Divisa en la que se expresan el total, el histórico y la composición.
  const [display, setDisplay] = useState<string>("EUR");
  // Posición cuyo detalle (lotes + simulación de venta) está abierto.
  const [detailId, setDetailId] = useState<string | null>(null);

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
        if (!cancelled) {
          setPrices(data);
          setPricesCheckedAt(Date.now());
        }
      } catch {
        // Los precios son enriquecimiento: si fallan, la cartera sigue usable (P&L "—").
        if (!cancelled) setPrices({});
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tickersKey, priceTick]);

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
      if (document.visibilityState !== "visible") return;
      void refresh();
      setPriceTick((tick) => tick + 1);
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
    setDetailId((cur) => (cur === id ? null : cur));
  }

  const rates = useMemo(() => fxRates?.rates ?? {}, [fxRates]);

  /**
   * Total agregado de la cartera. Vive AQUÍ y no en el resumen porque lo comparten el resumen
   * y el bloque de objetivo: si cada uno agregase por su cuenta, la misma pantalla podría
   * enseñar dos "patrimonios actuales" distintos.
   */
  const pricesFetchedAt = useMemo(() => latestFetchedAt(prices), [prices]);

  const agg = useMemo(
    () => aggregatePortfolio({ positions, prices, rates, display }),
    [positions, prices, rates, display],
  );

  // El detalle se deriva del id, no se guarda la posición: así, cuando `refresh()` trae la
  // cantidad y el precio medio reagregados tras tocar un lote, el panel los ve al instante.
  const detail = positions.find((p) => p.id === detailId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Barra de la cartera: la divisa se elige UNA vez (la comparten total, objetivo,
          histórico y composición) y se ofrece la descarga cuando hay algo que descargar. El
          selector vive fuera del resumen para que también esté disponible con la cartera
          vacía, donde el bloque de objetivo sigue siendo útil. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          {t("summary.displayIn")}
          <select
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          >
            {PORTFOLIO_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {currencyLabel(c)}
              </option>
            ))}
          </select>
        </label>
        {positions.length > 0 && (
          <PortfolioExport
            positions={positions}
            prices={prices}
            rates={rates}
            display={display}
          />
        )}
      </div>

      {positions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-foreground">{t("empty.title")}</p>
          <p className="mt-1 text-sm text-muted">{t("empty.body")}</p>
        </div>
      ) : (
        <>
          <PortfolioSummary
            agg={agg}
            fxAsOf={fxRates?.asOf ?? null}
            pricesFetchedAt={pricesFetchedAt}
            pricesCheckedAt={pricesCheckedAt}
            display={display}
          />
          <PortfolioHistoryChart display={display} />
          <PortfolioBreakdown
            positions={positions}
            prices={prices}
            rates={rates}
            display={display}
          />
          <PositionList
            positions={positions}
            prices={prices}
            rates={rates}
            editingId={editing?.id ?? null}
            detailId={detailId}
            onEdit={setEditing}
            onToggleDetail={(id) => setDetailId((cur) => (cur === id ? null : id))}
            onDeleted={handleDeleted}
          />
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

      {/* Fuera del condicional a propósito: con la cartera vacía el objetivo sigue siendo útil
          (patrimonio actual = 0) y es justo cuando más ayuda ver la cifra a la que apuntar. */}
      <PortfolioGoal
        marketValue={agg.marketValue}
        valued={agg.valued}
        total={agg.total}
        display={display}
        rates={rates}
      />

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
