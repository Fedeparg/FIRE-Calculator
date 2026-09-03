/**
 * Estado de una calculadora en la query string: serialización y parseo.
 *
 * Sirve para compartir un cálculo por enlace y para cargar un escenario guardado en la
 * cuenta. Las dos fuentes son ENTRADA NO FIABLE —una URL la puede editar cualquiera a mano,
 * y unos `inputs` guardados pueden haber quedado obsoletos o venir de la API/MCP—, así que
 * ambas pasan por el mismo validador: cada campo se decodifica contra su `FieldSpec` y lo
 * que no encaja cae al valor por defecto EN SILENCIO, sin romper la página.
 *
 * La defensa frente a inyección no es escapar nada: es que, después de decodificar, un valor
 * solo puede ser un número finito o un miembro de una lista cerrada de opciones. Una cadena
 * arbitraria de la URL nunca llega a la UI.
 *
 * Módulo puro (sin React ni DOM): recibe y devuelve cadenas de query string.
 */

import { formatDecimalInput } from "./number-input";

/** Valor de un campo de calculadora: un escalar que cabe en una query string. */
export type FieldValue = number | string;

/**
 * Qué es un campo y qué valores admite. `number` acepta cualquier número finito (no se
 * acota al rango: en `NumberField` los `min`/`max` gobiernan solo las flechas, y hay tasas
 * legítimamente negativas —un año en pérdidas, deflación—; acotar aquí haría que la URL
 * reescribiese en silencio un valor que el campo sí deja teclear). `option` es una lista
 * cerrada, así que ahí lo desconocido sí se rechaza.
 */
export type FieldSpec =
  | { readonly kind: "number"; readonly defaultValue: number }
  | { readonly kind: "option"; readonly defaultValue: string; readonly allowed: readonly string[] };

/** Los campos registrados por una calculadora, por clave de query string. */
export type FieldSpecs = Readonly<Record<string, FieldSpec>>;

/** Valores de los campos de una calculadora, por clave. */
export type FieldValues = Readonly<Record<string, FieldValue>>;

/**
 * Número en notación posicional: dígitos, un punto decimal opcional y signo negativo.
 *
 * Es deliberadamente MÁS ESTRICTO que `parseDecimalInput` (el del teclado del móvil, que
 * tolera comas y separadores de miles): en una URL, `1.234,56` es ambiguo, y admitir
 * notación científica dejaría entrar `1e400`, que es `Infinity`. Aquí solo hay una forma
 * válida de escribir un número, que es justo la que produce `encodeFieldValue`.
 */
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;

/**
 * Decodifica el valor crudo de un campo, o `null` si no es válido para su `spec`.
 * Devolver `null` (y no el valor por defecto) permite a quien llama distinguir "no venía"
 * de "venía mal"; ambos acaban en el valor por defecto, pero solo uno se puede contar.
 */
export function decodeFieldValue(spec: FieldSpec, raw: string): FieldValue | null {
  if (spec.kind === "option") {
    return spec.allowed.includes(raw) ? raw : null;
  }

  if (!NUMBER_PATTERN.test(raw)) return null;
  const parsed = Number(raw);
  // El patrón ya descarta `NaN`/`Infinity`, pero un literal larguísimo sí puede desbordar.
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Escribe un valor para la URL. Los números van siempre con punto y en notación posicional
 * (nunca `1e+21`, que al releerse no pasaría `NUMBER_PATTERN`), de modo que el viaje de ida
 * y vuelta conserva el valor.
 */
export function encodeFieldValue(value: FieldValue): string {
  return typeof value === "number" ? formatDecimalInput(value, ".") : value;
}

/**
 * Lee el estado de la calculadora de una query string.
 *
 * Solo se miran las claves registradas: cualquier otro parámetro (`utm_*`, lo que sea) se
 * ignora aquí y lo conserva `encodeCalculatorState`. Las claves conocidas con un valor
 * inválido se omiten, y quien llama las resuelve con el valor por defecto de su `spec`.
 */
export function decodeCalculatorState(search: string, specs: FieldSpecs): FieldValues {
  const params = new URLSearchParams(search);
  const values: Record<string, FieldValue> = {};

  for (const [key, spec] of Object.entries(specs)) {
    const raw = params.get(key);
    if (raw === null) continue;
    const value = decodeFieldValue(spec, raw);
    if (value !== null) values[key] = value;
  }

  return values;
}

/**
 * Lee el estado de la calculadora de unos `inputs` JSON (un escenario guardado en la
 * cuenta). Misma validación que la URL —de ahí que ambos caminos compartan este módulo—,
 * con la diferencia de que aquí un número puede llegar ya como `number` y no como texto.
 */
export function decodeCalculatorInputs(inputs: unknown, specs: FieldSpecs): FieldValues {
  if (typeof inputs !== "object" || inputs === null || Array.isArray(inputs)) return {};
  const source = inputs as Record<string, unknown>;
  const values: Record<string, FieldValue> = {};

  for (const [key, spec] of Object.entries(specs)) {
    const raw = source[key];
    if (typeof raw === "number") {
      if (spec.kind === "number" && Number.isFinite(raw)) values[key] = raw;
      continue;
    }
    if (typeof raw !== "string") continue;
    const value = decodeFieldValue(spec, raw);
    if (value !== null) values[key] = value;
  }

  return values;
}

/**
 * Devuelve la query string que representa `values`, partiendo de `search` para NO perder
 * parámetros ajenos a la calculadora.
 *
 * Un campo que valga lo mismo que su valor por defecto se omite: así una calculadora recién
 * abierta tiene una URL limpia y los enlaces compartidos solo llevan lo que se ha cambiado.
 * Como efecto secundario, un parámetro conocido con un valor inválido desaparece de la URL,
 * que es coherente con que la calculadora lo esté ignorando.
 *
 * El resultado incluye el `?` inicial, o es cadena vacía si no queda ningún parámetro
 * (comparable directamente con `window.location.search`).
 */
export function encodeCalculatorState(
  search: string,
  values: FieldValues,
  specs: FieldSpecs,
): string {
  const params = new URLSearchParams(search);

  for (const [key, spec] of Object.entries(specs)) {
    const value = values[key] ?? spec.defaultValue;
    if (value === spec.defaultValue) {
      params.delete(key);
      continue;
    }
    params.set(key, encodeFieldValue(value));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Valores completos de la calculadora: lo que hay en `values` y, para el resto de campos
 * registrados, su valor por defecto. Es lo que se guarda como `inputs` de un escenario, para
 * que al cargarlo se reproduzca el cálculo entero y no solo lo que se tocó.
 */
export function completeValues(values: FieldValues, specs: FieldSpecs): FieldValues {
  const complete: Record<string, FieldValue> = {};
  for (const [key, spec] of Object.entries(specs)) {
    complete[key] = values[key] ?? spec.defaultValue;
  }
  return complete;
}
