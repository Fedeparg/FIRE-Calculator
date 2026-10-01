// Preparación de la serie histórica de la cartera para la gráfica. Core puro (sin React),
// testeable.
//
// El backend (`GET /api/portfolio/history`) guarda un punto por día EN EUROS y lo reexpresa a
// la divisa pedida con las tasas FX de CADA día, así que aquí no se convierte nada: solo se
// recorta el rango, se descartan los puntos que el backend no pudo convertir y se resume el
// periodo.

import type { HistoryPointDto } from "./types.js";

/**
 * Un punto ya listo para pintar: sin nulos y con las claves que consume la gráfica. Es un
 * `type` y no una `interface` a propósito: TypeScript solo deriva una firma de índice
 * implícita para los alias, y `TimeSeriesChart` recibe filas como `Record<string, …>`.
 */
export type HistoryChartPoint = {
  date: string;
  invested: number;
  marketValue: number;
  estimated: boolean;
};

/** Rangos ofrecidos en el selector. `days` es lo que se le pide a la API. */
export type HistoryRangeKey = "30d" | "90d" | "1y" | "all";

/**
 * `all` pide el máximo que admite el backend (`HISTORY_MAX_DAYS` = 1825, cinco años). No es
 * "todo" en sentido literal, pero sí todo lo que la API está dispuesta a servir; mantener el
 * mismo tope evita un 400 por pasarse.
 */
export const HISTORY_RANGES: readonly { key: HistoryRangeKey; days: number }[] = [
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "1y", days: 365 },
  { key: "all", days: 1825 },
];

/** Rango por defecto: tres meses, suficiente para ver tendencia sin aplastar el detalle. */
export const DEFAULT_HISTORY_RANGE: HistoryRangeKey = "90d";

/**
 * Puntos mínimos para que una gráfica signifique algo. Con uno solo no hay línea que dibujar
 * (una cuenta recién creada tiene exactamente ese caso), así que la UI muestra una
 * explicación en lugar de un lienzo vacío.
 */
export const MIN_HISTORY_POINTS = 2;

/** Serie lista para la UI, con lo que hace falta para decidir qué pintar. */
export interface HistorySeries {
  /** Puntos completos (los no convertibles quedan fuera), en orden cronológico. */
  points: HistoryChartPoint[];
  /** Puntos descartados por no ser convertibles a la divisa elegida. */
  dropped: number;
  /** `true` cuando no hay suficientes puntos para dibujar una línea. */
  insufficient: boolean;
  /** Variación del valor de mercado entre el primer y el último punto, o `null`. */
  changeAbs: number | null;
  /** Esa misma variación en %, o `null` si el punto de partida era 0. */
  changePct: number | null;
  /** Primera y última fecha de la serie pintada, o `null` si está vacía. */
  from: string | null;
  to: string | null;
  /**
   * Tramos contiguos de puntos `estimated`, en orden. Con la regla actual (estimado = anterior
   * al inicio del seguimiento) es uno, un prefijo de la serie; se sigue calculando por tramos
   * para tolerar datos que no lo cumplan (p. ej. filas aún sin reparar por el backfill).
   */
  estimatedRanges: { from: string; to: string }[];
}

/**
 * Convierte la respuesta de la API en una serie pintable.
 *
 * Un punto sin `invested` o sin `marketValue` significa que ese día la cartera no era
 * convertible a la divisa elegida: se descarta y se cuenta en `dropped` para poder decirlo en
 * la interfaz, en lugar de dibujar un 0 que se leería como "ese día no valía nada".
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

  // El backend ya devuelve la serie ordenada, pero ordenar aquí hace la función independiente
  // de esa garantía (y las fechas ISO se ordenan bien como texto).
  usable.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

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

/** Ganancia de la cartera en un periodo. */
export interface PeriodGain {
  /** Variación de la ganancia acumulada (valor − invertido) en el periodo. */
  gain: number;
  /** Fecha del punto de partida (el primero disponible desde `from`). */
  since: string;
  /** El punto de partida es anterior al inicio del seguimiento en Sextante (reconstrucción). */
  estimated: boolean;
}

/**
 * Cuánto ha ganado la cartera desde `from` (p. ej. el 1 de enero): la variación de su ganancia
 * acumulada, NO la del valor de mercado. Así una aportación a mitad de año no cuenta como
 * rentabilidad: sube a la vez lo invertido y el valor, y la ganancia no cambia.
 *
 * Parte del primer punto con fecha `>= from` (si la serie empieza más tarde, desde ahí: la
 * interfaz lo dice) y acaba en el último. `null` si no hay al menos dos puntos utilizables.
 */
export function gainSince(points: readonly HistoryPointDto[], from: string): PeriodGain | null {
  const usable = points
    .filter((p) => p.date >= from && p.pnlAbs !== null && Number.isFinite(p.pnlAbs))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (usable.length < MIN_HISTORY_POINTS) return null;
  const first = usable[0];
  const last = usable[usable.length - 1];
  return { gain: last.pnlAbs! - first.pnlAbs!, since: first.date, estimated: first.estimated };
}

/** Valoración en vivo de la cartera, para cerrar la serie en el día de hoy. */
export interface LiveValuation {
  /** Fecha de hoy (`YYYY-MM-DD`, UTC, como los snapshots). */
  date: string;
  marketValue: number;
  invested: number;
  pnlAbs: number;
  pnlPct: number | null;
  valuedPositions: number;
  totalPositions: number;
}

/**
 * Añade la valoración en vivo como último punto: el snapshot del día se escribe de noche, así
 * que sin esto la gráfica acaba ayer aunque el Resumen ya enseñe el valor de hoy. Solo si es
 * posterior al último punto y hay algo valorado; si ya hay punto de hoy, manda el snapshot.
 */
export function withLivePoint(points: readonly HistoryPointDto[], live: LiveValuation | null): HistoryPointDto[] {
  if (!live || live.valuedPositions === 0 || !Number.isFinite(live.marketValue)) return [...points];
  const last = points.reduce<string | null>((max, p) => (max === null || p.date > max ? p.date : max), null);
  if (last !== null && last >= live.date) return [...points];
  return [...points, { ...live, estimated: false }];
}
