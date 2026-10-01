"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { aggregatePortfolio, type PortfolioAggregate } from "@sextante/core/fx";
import { isPricePending, latestFetchedAt } from "@/core/portfolio-prices";
import type { FxRates, PriceInfo, Position } from "@/lib/portfolio";

/** Cada cuánto se re-piden los precios mientras alguna posición sigue "buscando precio". */
const PENDING_POLL_MS = 12_000;

/** Lo que comparten las pestañas de la cartera. */
export type PortfolioData = {
  positions: Position[];
  setPositions: Dispatch<SetStateAction<Position[]>>;
  /** Re-sincroniza las posiciones con la API (fuente de verdad). */
  refresh: () => Promise<void>;
  /** Últimos precios conocidos por ticker (de nuestra DB, nunca de la fuente externa). */
  prices: Record<string, PriceInfo>;
  /** USD por unidad de cada divisa. */
  rates: Record<string, number>;
  fxAsOf: string | null;
  /** Divisa en la que se expresan el total, el histórico, la composición y el objetivo. */
  display: string;
  setDisplay: (currency: string) => void;
  /** Total de la cartera en `display`. */
  agg: PortfolioAggregate;
  /** Posiciones sin precio que el servidor aún está buscando (ver `isPricePending`). */
  pendingIds: ReadonlySet<string>;
  pricesFetchedAt: string | null;
  pricesCheckedAt: number | null;
};

const PortfolioDataContext = createContext<PortfolioData | null>(null);

/** Datos de la cartera para cualquier componente bajo el layout de las pestañas. */
export function usePortfolioData(): PortfolioData {
  const data = useContext(PortfolioDataContext);
  if (!data) throw new Error("usePortfolioData must be used inside <PortfolioDataProvider>");
  return data;
}

type Props = {
  initialPositions: Position[];
  children: ReactNode;
};

/**
 * Estado de la cartera compartido por sus pestañas (Resumen, Posiciones, Plusvalías, Objetivo).
 *
 * Vive en el layout de las pestañas y no en cada página por dos motivos. Uno: el layout no se
 * vuelve a montar al cambiar de pestaña (React lo conserva), así que posiciones, precios y la
 * divisa elegida sobreviven a la navegación sin volver a pedirse. Dos: el total lo enseñan
 * varias pestañas, y si cada una agregase por su cuenta podrían mostrar dos "patrimonios
 * actuales" distintos.
 *
 * La carga inicial (SSR) llega por props desde el layout; la autorización y el scoping por
 * usuario los decide siempre la API.
 */
export default function PortfolioDataProvider({ initialPositions, children }: Props) {
  const [positions, setPositions] = useState<Position[]>(initialPositions);
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
  /**
   * "Ahora" (ms) para decidir qué posiciones siguen buscando precio. Se fija al llegar cada
   * respuesta de precios, así que avanza con el sondeo y la ventana de "buscando" caduca sola.
   */
  const [now, setNow] = useState(() => Date.now());
  const [fxRates, setFxRates] = useState<FxRates | null>(null);
  const [display, setDisplay] = useState<string>("EUR");

  // Clave estable de los tickers distintos: solo re-pedimos precios si el CONJUNTO cambia
  // (no al editar cantidad/precio medio). Es justo el `?symbols=` que espera la API.
  const tickersKey = useMemo(
    // Los derivados no se valoran: no se piden sus precios.
    () =>
      [...new Set(positions.filter((p) => !p.isDerivative).map((p) => p.ticker))].sort().join(","),
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
          setNow(Date.now());
        }
      } catch {
        // Los precios son enriquecimiento: si fallan, la cartera sigue usable (P&L "—").
        if (!cancelled) {
          setPrices({});
          setNow(Date.now());
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tickersKey, priceTick]);

  const pendingIds = useMemo(
    () =>
      new Set(
        positions.filter((p) => isPricePending(p, prices[p.ticker], now)).map((p) => p.id),
      ),
    [positions, prices, now],
  );
  const hasPending = pendingIds.size > 0;

  // Sondeo corto SOLO mientras haya algo pendiente: reutiliza la misma carga de precios
  // (sube `priceTick`) y se detiene solo cuando llega el precio o caduca la ventana. En
  // segundo plano no consume nada; al volver a la pestaña, el auto-refresco de abajo repone.
  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") setPriceTick((tick) => tick + 1);
    }, PENDING_POLL_MS);
    return () => clearInterval(interval);
  }, [hasPending]);

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

  const rates = useMemo(() => fxRates?.rates ?? {}, [fxRates]);
  const pricesFetchedAt = useMemo(() => latestFetchedAt(prices), [prices]);
  const agg = useMemo(
    () => aggregatePortfolio({ positions, prices, rates, display }),
    [positions, prices, rates, display],
  );

  const value = useMemo<PortfolioData>(
    () => ({
      positions,
      setPositions,
      refresh,
      prices,
      rates,
      fxAsOf: fxRates?.asOf ?? null,
      display,
      setDisplay,
      agg,
      pendingIds,
      pricesFetchedAt,
      pricesCheckedAt,
    }),
    [positions, refresh, prices, rates, fxRates, display, agg, pendingIds, pricesFetchedAt, pricesCheckedAt],
  );

  return <PortfolioDataContext.Provider value={value}>{children}</PortfolioDataContext.Provider>;
}
