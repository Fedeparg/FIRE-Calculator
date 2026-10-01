// Estado de una calculadora en la query string (enlaces compartidos y escenarios guardados).
// Ambas fuentes son entrada no fiable: cada campo se decodifica contra su `FieldSpec` y lo
// inválido cae al valor por defecto en silencio. La defensa frente a inyección es que un
// valor solo puede ser un número finito o un miembro de una lista cerrada.

import { formatDecimalInput } from "@/shared/format/number-input";

export type FieldValue = number | string;

/**
 * `number` acepta cualquier finito sin acotar al rango (`min`/`max` solo gobiernan las flechas
 * y hay tasas negativas legítimas); `option` es lista cerrada y rechaza lo desconocido.
 */
export type FieldSpec =
  | { readonly kind: "number"; readonly defaultValue: number }
  | { readonly kind: "option"; readonly defaultValue: string; readonly allowed: readonly string[] };

export type FieldSpecs = Readonly<Record<string, FieldSpec>>;

export type FieldValues = Readonly<Record<string, FieldValue>>;

// Más estricto que `parseDecimalInput`: en una URL `1.234,56` es ambiguo y la notación
// científica dejaría entrar `1e400` (Infinity). Solo admite lo que produce `encodeFieldValue`.
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** `null` si no es válido (no el valor por defecto: permite distinguir "venía mal"). */
export function decodeFieldValue(spec: FieldSpec, raw: string): FieldValue | null {
  if (spec.kind === "option") {
    return spec.allowed.includes(raw) ? raw : null;
  }

  if (!NUMBER_PATTERN.test(raw)) return null;
  const parsed = Number(raw);
  // Un literal larguísimo puede desbordar a Infinity pese al patrón.
  return Number.isFinite(parsed) ? parsed : null;
}

/** Números con punto y en notación posicional (`1e+21` no pasaría `NUMBER_PATTERN` al releerse). */
export function encodeFieldValue(value: FieldValue): string {
  return typeof value === "number" ? formatDecimalInput(value, ".") : value;
}

/**
 * Solo mira las claves registradas (el resto, p. ej. `utm_*`, lo conserva
 * `encodeCalculatorState`); los valores inválidos se omiten.
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

/** Como la URL, pero desde `inputs` JSON de un escenario guardado (un número puede venir ya como `number`). */
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
 * Parte de `search` para no perder parámetros ajenos. Omite los campos iguales a su valor por
 * defecto (URL limpia) y los inválidos. Devuelve `?...` o "" (comparable con `location.search`).
 */
export function encodeCalculatorState(search: string, values: FieldValues, specs: FieldSpecs): string {
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

/** `values` más el valor por defecto del resto: lo que se guarda como `inputs` de un escenario. */
export function completeValues(values: FieldValues, specs: FieldSpecs): FieldValues {
  const complete: Record<string, FieldValue> = {};
  for (const [key, spec] of Object.entries(specs)) {
    complete[key] = values[key] ?? spec.defaultValue;
  }
  return complete;
}
