/**
 * Estado de los filtros de novedades en la query string: serialización y parseo.
 *
 * Existe para que una vista filtrada se pueda compartir y recargar, igual que un cálculo de
 * una calculadora (`calculator-url-state.ts`). Es el mismo criterio de diseño y las mismas
 * dos reglas:
 *
 * - La URL es ENTRADA NO FIABLE: `cat` se valida contra la lista cerrada de categorías y lo
 *   desconocido cae en silencio al valor por defecto, así que una cadena arbitraria de la
 *   barra de direcciones nunca llega a la interfaz.
 * - Los valores por defecto NO se escriben: el estado inicial deja la URL limpia, sin
 *   `?cat=all&internal=0`.
 *
 * Módulo puro (sin React ni DOM): recibe y devuelve cadenas de query string.
 */

import { CHANGELOG_CATEGORIES, type ChangelogFilter } from "./changelog";

/** Nombres de los parámetros. Forman parte de los enlaces compartidos: no se renombran. */
const CATEGORY_PARAM = "cat";
const INTERNAL_PARAM = "internal";

/** Estado con el que se prerenderiza la página: todas las categorías, sin internos. */
export const DEFAULT_CHANGELOG_FILTER: ChangelogFilter = {
  category: "all",
  includeInternal: false,
};

/**
 * Lee los filtros de una query string. Lo que no venga, o venga mal, toma su valor por
 * defecto: la página siempre es legible, aunque el enlace esté roto o manipulado.
 */
export function decodeChangelogFilter(search: string): ChangelogFilter {
  const params = new URLSearchParams(search);

  const rawCategory = params.get(CATEGORY_PARAM);
  const category = (CHANGELOG_CATEGORIES as readonly string[]).includes(rawCategory ?? "")
    ? (rawCategory as ChangelogFilter["category"])
    : DEFAULT_CHANGELOG_FILTER.category;

  return {
    category,
    // Solo "1" activa los internos: un booleano con una única forma válida de escribirse es
    // el que produce `encodeChangelogFilter`, y evita discutir si "false" es verdadero.
    includeInternal: params.get(INTERNAL_PARAM) === "1",
  };
}

/**
 * Escribe los filtros sobre una query string existente, conservando los demás parámetros
 * (campañas, `utm_*`… no son nuestros y no se tiran). Devuelve la query completa con "?",
 * o cadena vacía si no queda nada que escribir.
 */
export function encodeChangelogFilter(search: string, filter: ChangelogFilter): string {
  const params = new URLSearchParams(search);

  if (filter.category === DEFAULT_CHANGELOG_FILTER.category) {
    params.delete(CATEGORY_PARAM);
  } else {
    params.set(CATEGORY_PARAM, filter.category);
  }

  if (filter.includeInternal === DEFAULT_CHANGELOG_FILTER.includeInternal) {
    params.delete(INTERNAL_PARAM);
  } else {
    params.set(INTERNAL_PARAM, "1");
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}
