// A calculator's state in the query string (shared links and saved scenarios).
// Both sources are untrusted input: each field is decoded against its `FieldSpec` and anything
// invalid silently falls back to the default. The defense against injection is that a value can
// only be a finite number or a member of a closed list.

import { formatDecimalInput } from "@/shared/format/number-input";

export type FieldValue = number | string;

/**
 * `number` accepts any finite value without clamping to the range (`min`/`max` only drive the
 * arrow keys and there are legitimate negative rates); `option` is a closed list and rejects
 * unknown values.
 */
export type FieldSpec =
  | { readonly kind: "number"; readonly defaultValue: number }
  | { readonly kind: "option"; readonly defaultValue: string; readonly allowed: readonly string[] };

export type FieldSpecs = Readonly<Record<string, FieldSpec>>;

export type FieldValues = Readonly<Record<string, FieldValue>>;

// Stricter than `parseDecimalInput`: in a URL `1.234,56` is ambiguous and scientific notation
// would let `1e400` (Infinity) in. It only accepts what `encodeFieldValue` produces.
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** `null` if invalid (not the default value: lets callers tell "it was malformed" apart). */
export function decodeFieldValue(spec: FieldSpec, raw: string): FieldValue | null {
  if (spec.kind === "option") {
    return spec.allowed.includes(raw) ? raw : null;
  }

  if (!NUMBER_PATTERN.test(raw)) return null;
  const parsed = Number(raw);
  // A very long literal can overflow to Infinity despite the pattern.
  return Number.isFinite(parsed) ? parsed : null;
}

/** Numbers with a decimal point in positional notation (`1e+21` would fail `NUMBER_PATTERN` when read back). */
export function encodeFieldValue(value: FieldValue): string {
  return typeof value === "number" ? formatDecimalInput(value, ".") : value;
}

/**
 * Only looks at registered keys (`encodeCalculatorState` keeps the rest, e.g. `utm_*`); invalid
 * values are skipped.
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

/** Like the URL, but from a saved scenario's JSON `inputs` (a number may already arrive as `number`). */
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
 * Starts from `search` so unrelated parameters are not lost. Omits fields equal to their default
 * (clean URL) and invalid ones. Returns `?...` or "" (comparable with `location.search`).
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

/** `values` plus the default for the rest: what is saved as a scenario's `inputs`. */
export function completeValues(values: FieldValues, specs: FieldSpecs): FieldValues {
  const complete: Record<string, FieldValue> = {};
  for (const [key, spec] of Object.entries(specs)) {
    complete[key] = values[key] ?? spec.defaultValue;
  }
  return complete;
}
