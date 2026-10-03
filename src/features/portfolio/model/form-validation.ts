// Validación de los formularios de cartera: del texto tecleado a los números que viajan a la API.
// Pura (sin React): la comparten los componentes y se prueba en node. Las reglas son las mismas
// que aplica la API (que es quien decide); aquí solo sirven para habilitar el botón y avisar.

import { withholdingsFitGross } from "@sextante/core/fiscal/income";
import { parseDecimalInput } from "@/shared/format/number-input";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;

/** Número tecleado, o `NaN` si aún no lo es ("", "-", "abc"). */
function decimalOrNaN(raw: string): number {
  return parseDecimalInput(raw) ?? Number.NaN;
}

/** Campo opcional: vacío vale `empty`; si no, el número tecleado (o `NaN`). */
function optionalDecimal<T extends number | null>(raw: string, empty: T): number | T {
  return raw.trim() === "" ? empty : decimalOrNaN(raw);
}

const isPositive = (value: number) => Number.isFinite(value) && value > 0;
const isNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

/** Cantidad y precio medio de una posición. `null` si falta el símbolo o algún número no vale. */
export function validatePositionForm(values: {
  ticker: string;
  quantity: string;
  avgPrice: string;
}): { quantity: number; avgPrice: number } | null {
  const quantity = decimalOrNaN(values.quantity);
  const avgPrice = decimalOrNaN(values.avgPrice);
  if (values.ticker.trim() === "" || !isPositive(quantity) || !isNonNegative(avgPrice)) return null;
  return { quantity, avgPrice };
}

/** Importes de un lote (las comisiones vacías son 0). `null` si alguno no vale o falta la fecha. */
export function validateLotForm(values: {
  quantity: string;
  price: string;
  fees: string;
  tradedAt: string;
}): { quantity: number; price: number; fees: number } | null {
  const quantity = decimalOrNaN(values.quantity);
  const price = decimalOrNaN(values.price);
  const fees = optionalDecimal(values.fees, 0);
  const valid = isPositive(quantity) && isNonNegative(price) && isNonNegative(fees) && ISO_DAY.test(values.tradedAt);
  return valid ? { quantity, price, fees } : null;
}

/** Lo que se envía de un cobro tras validar los campos de texto. */
export type IncomeFormNumbers = {
  gross: number;
  /** `null` = retención en origen desconocida (distinto de 0). */
  withholdingOrigin: number | null;
  withholdingSpain: number;
  /** Código ISO de dos letras en mayúsculas, o `null` si no se indica. */
  country: string | null;
};

/**
 * Valida un cobro. `incomplete`: aún falta algo por teclear bien (no se avisa). `inconsistent`:
 * el íntegro y las retenciones son números válidos pero el conjunto no cuadra (retenciones por
 * encima del íntegro, país o fecha mal): se avisa, porque el usuario cree que ya ha terminado.
 */
export function validateIncomeForm(values: {
  gross: string;
  origin: string;
  spain: string;
  country: string;
  paidAt: string;
}): { ok: true; value: IncomeFormNumbers } | { ok: false; reason: "incomplete" | "inconsistent" } {
  const gross = decimalOrNaN(values.gross);
  const origin = optionalDecimal(values.origin, null);
  const spain = optionalDecimal(values.spain, 0);
  const country = values.country.trim().toUpperCase();

  const withholdingsValid = (origin === null || isNonNegative(origin)) && isNonNegative(spain);
  const valid =
    isPositive(gross) &&
    withholdingsValid &&
    withholdingsFitGross(gross, origin, spain) &&
    (country === "" || COUNTRY_CODE.test(country)) &&
    ISO_DAY.test(values.paidAt);
  if (valid) {
    return {
      ok: true,
      value: { gross, withholdingOrigin: origin, withholdingSpain: spain, country: country || null },
    };
  }
  const typed = values.gross.trim() !== "" && Number.isFinite(gross) && withholdingsValid;
  return { ok: false, reason: typed ? "inconsistent" : "incomplete" };
}

/**
 * Saldos pendientes de ejercicios anteriores: cada importe > 0 y sin repetir ejercicio y tipo.
 * Devuelve los importes en el mismo orden, o `null` si alguno no vale; `duplicated` se informa
 * aparte porque tiene su propio aviso.
 */
export function validatePendingBalances<K extends string>(
  rows: readonly { originYear: number; kind: K; amount: string }[],
): { duplicated: boolean; amounts: number[] | null } {
  const duplicated = new Set(rows.map((row) => `${row.originYear}:${row.kind}`)).size !== rows.length;
  const amounts = rows.map((row) => decimalOrNaN(row.amount));
  return { duplicated, amounts: !duplicated && amounts.every(isPositive) ? amounts : null };
}
