// Ordenación de la tabla de posiciones. Core puro (sin React), testeable.
//
// La UI decora cada fila con sus valores comparables ya normalizados a una divisa base
// (USD) para poder comparar importes entre posiciones en divisas distintas. Aquí solo
// vive la comparación: nulos siempre al final, desempate estable por ticker.

/** Campo por el que se puede ordenar la tabla de posiciones. */
export type SortKey = "ticker" | "name" | "quantity" | "avgPrice" | "broker" | "invested" | "marketValue" | "pnl";

/** Sentido de la ordenación: descendente (mayor a menor) o ascendente. */
export type SortDir = "asc" | "desc";

/** Por defecto ordenamos por lo invertido, de mayor a menor. Es el único campo siempre
 *  definido (no depende de que haya llegado el precio de mercado), así el orden inicial es
 *  estable y no se reordena cuando cargan los precios de forma asíncrona. */
export const DEFAULT_SORT_KEY: SortKey = "invested";
export const DEFAULT_SORT_DIR: SortDir = "desc";

/**
 * Valores comparables de una posición, ya precalculados por la UI. Los importes monetarios
 * vienen convertidos a una divisa base común (USD); `null` si faltaba la tasa de cambio.
 * `pnl` es el mismo número que se muestra (porcentaje o importe base) según el modo activo.
 */
export interface SortableRow {
  ticker: string;
  name: string | null;
  broker: string | null;
  quantity: number;
  avgPrice: number | null;
  invested: number | null;
  marketValue: number | null;
  pnl: number | null;
}

const STRING_KEYS = new Set<SortKey>(["ticker", "name", "broker"]);

/** localeCompare tolerante a acentos y con orden numérico dentro de las cadenas. */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

/**
 * Compara dos filas por `key` en el sentido `dir`. Los valores ausentes (`null`) van SIEMPRE
 * al final, tanto en ascendente como en descendente (no queremos que un "—" se cuele arriba).
 */
function compareRows(a: SortableRow, b: SortableRow, key: SortKey, dir: SortDir): number {
  const factor = dir === "asc" ? 1 : -1;

  if (STRING_KEYS.has(key)) {
    const av = a[key] as string | null;
    const bv = b[key] as string | null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return factor * compareStrings(av, bv);
  }

  const av = a[key] as number | null;
  const bv = b[key] as number | null;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return factor * (av - bv);
}

/**
 * Ordena una lista de filas (cada una con su `sortable`) por `key` y `dir`, sin mutar la
 * entrada. `Array.prototype.sort` es estable, pero además desempatamos por ticker para que el
 * orden sea determinista aunque dos posiciones empaten en el campo elegido.
 */
export function sortPositions<T extends { sortable: SortableRow }>(
  rows: readonly T[],
  key: SortKey,
  dir: SortDir,
): T[] {
  return [...rows].sort((ra, rb) => {
    const primary = compareRows(ra.sortable, rb.sortable, key, dir);
    if (primary !== 0) return primary;
    return compareStrings(ra.sortable.ticker, rb.sortable.ticker);
  });
}
