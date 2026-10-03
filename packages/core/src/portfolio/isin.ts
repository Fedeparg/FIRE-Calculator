import type { IncomePayload } from "../fiscal/income.js";
import type { Position } from "./types.js";

/**
 * Formato de un ISIN (ISO 6166): dos letras de país, nueve alfanuméricos y un dígito de control
 * (no se verifica el dígito). Lo comparten la web, el DTO de cobros y el resolutor de símbolos.
 */
export const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** ¿Tiene `value` forma de ISIN? Sensible a mayúsculas: normaliza antes si hace falta. */
export function isIsin(value: string): boolean {
  return ISIN_PATTERN.test(value);
}

/** País del emisor según el ISIN (sus dos primeras letras), o `null` si no es un ISIN. */
export function isinCountry(value: string): string | null {
  return isIsin(value) ? value.slice(0, 2) : null;
}

/**
 * Valores de partida de un cobro nuevo de una posición. Un ticker con forma de ISIN (posiciones
 * importadas) da el ISIN y el país del emisor de sus dividendos.
 */
export function incomeDefaultsFor(
  position: Pick<Position, "id" | "ticker" | "name" | "currency">,
): Pick<IncomePayload, "kind" | "positionId" | "isin" | "name" | "country" | "currency"> {
  const isin = isIsin(position.ticker) ? position.ticker : null;
  return {
    kind: "dividend",
    positionId: position.id,
    isin,
    name: position.name ?? position.ticker,
    country: isin ? isinCountry(isin) : null,
    currency: position.currency,
  };
}
