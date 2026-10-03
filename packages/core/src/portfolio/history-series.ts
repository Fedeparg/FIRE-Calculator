// Serie histórica de la cartera para la gráfica. Core puro. El backend guarda un punto diario en
// euros y lo reexpresa con las tasas FX de cada día; aquí solo se recorta, se descartan los puntos no
// convertibles y se resume el periodo.

import { compareStrings } from "../compare.js";
import type { HistoryPointDto } from "./types.js";

/** Punto listo para pintar. Es un `type` (no `interface`) para tener firma de índice implícita: `TimeSeriesChart` recibe `Record<string, …>`. */
export type HistoryChartPoint = {
  date: string;
  invested: number;
  marketValue: number;
  estimated: boolean;
};

export type HistoryRangeKey = "30d" | "90d" | "1y" | "all";

/** `all` pide el máximo del backend (`HISTORY_MAX_DAYS` = 1825); pasarse da 400. */
export const HISTORY_RANGES: readonly { key: HistoryRangeKey; days: number }[] = [
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "1y", days: 365 },
  { key: "all", days: 1825 },
];

export const DEFAULT_HISTORY_RANGE: HistoryRangeKey = "90d";

/** Puntos mínimos para dibujar una línea; con menos (cuenta recién creada) la UI explica en vez de mostrar un lienzo vacío. */
export const MIN_HISTORY_POINTS = 2;

export interface HistorySeries {
  /** Puntos completos, en orden cronológico. */
  points: HistoryChartPoint[];
  /** Puntos descartados por no ser convertibles a la divisa elegida. */
  dropped: number;
  insufficient: boolean;
  /** Variación del valor de mercado entre el primer y el último punto, o `null`. */
  changeAbs: number | null;
  /** La misma variación en %, o `null` si partía de 0. */
  changePct: number | null;
  from: string | null;
  to: string | null;
  /** Tramos contiguos de puntos `estimated`; se calculan por tramos para tolerar filas sin reparar por el backfill. */
  estimatedRanges: { from: string; to: string }[];
}

/**
 * Convierte la respuesta de la API en una serie pintable. Un punto sin `invested` o `marketValue`
 * no era convertible ese día: se descarta y cuenta en `dropped`, en vez de dibujar un 0.
 */
export function buildHistorySeries(points: readonly HistoryPointDto[]): HistorySeries {
  const usable: HistoryChartPoint[] = [];
  let dropped = 0;

  for (const point of points) {
    if (
      point.invested === null ||
      point.marketValue === null ||
      !Number.isFinite(point.invested) ||
      !Number.isFinite(point.marketValue)
    ) {
      dropped += 1;
      continue;
    }
    usable.push({
      date: point.date,
      invested: point.invested,
      marketValue: point.marketValue,
      estimated: point.estimated,
    });
  }

  // ordenar aquí evita depender del orden del backend
  usable.sort((a, b) => compareStrings(a.date, b.date));

  const first = usable[0];
  const last = usable[usable.length - 1];
  const changeAbs = first && last && first !== last ? last.marketValue - first.marketValue : null;

  const estimatedRanges: { from: string; to: string }[] = [];
  let runStart: string | null = null;
  let runEnd = "";
  for (const point of usable) {
    if (point.estimated) {
      runStart ??= point.date;
      runEnd = point.date;
    } else if (runStart !== null) {
      estimatedRanges.push({ from: runStart, to: runEnd });
      runStart = null;
    }
  }
  if (runStart !== null) estimatedRanges.push({ from: runStart, to: runEnd });

  return {
    points: usable,
    dropped,
    insufficient: usable.length < MIN_HISTORY_POINTS,
    changeAbs,
    changePct: changeAbs !== null && first.marketValue > 0 ? (changeAbs / first.marketValue) * 100 : null,
    from: first?.date ?? null,
    to: last?.date ?? null,
    estimatedRanges,
  };
}

export interface PeriodGain {
  gain: number;
  since: string;
  /** El punto de partida es anterior al seguimiento en Sextante (reconstrucción). */
  estimated: boolean;
}

/**
 * Ganancia desde `from`: variación de la ganancia acumulada (no del valor de mercado), para que una
 * aportación a mitad de año no cuente como rentabilidad. Parte del primer punto con fecha `>= from`;
 * `null` con menos de dos puntos utilizables.
 */
export function gainSince(points: readonly HistoryPointDto[], from: string): PeriodGain | null {
  const usable = points
    .filter((p): p is HistoryPointDto & { pnlAbs: number } => p.date >= from && Number.isFinite(p.pnlAbs))
    .sort((a, b) => compareStrings(a.date, b.date));
  if (usable.length < MIN_HISTORY_POINTS) return null;
  const first = usable[0];
  const last = usable[usable.length - 1];
  return { gain: last.pnlAbs - first.pnlAbs, since: first.date, estimated: first.estimated };
}

export interface LiveValuation {
  date: string;
  marketValue: number;
  invested: number;
  pnlAbs: number;
  pnlPct: number | null;
  valuedPositions: number;
  totalPositions: number;
}

/**
 * Añade la valoración en vivo como último punto (el snapshot del día se escribe de noche). Solo si
 * es posterior al último punto y hay algo valorado; si ya hay punto de hoy, manda el snapshot.
 */
export function withLivePoint(points: readonly HistoryPointDto[], live: LiveValuation | null): HistoryPointDto[] {
  if (!live || live.valuedPositions === 0 || !Number.isFinite(live.marketValue)) return [...points];
  const last = points.reduce<string | null>((max, p) => (max === null || p.date > max ? p.date : max), null);
  if (last !== null && last >= live.date) return [...points];
  return [...points, { ...live, estimated: false }];
}
