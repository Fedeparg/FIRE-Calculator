import type { IncomePayload } from "../fiscal/income.js";
import type { Position } from "./types.js";

/**
 * ISIN format (ISO 6166): two country letters, nine alphanumerics and a check digit (the digit is
 * not verified). Shared by the web app, the income DTO and the symbol resolver.
 */
export const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** Does `value` look like an ISIN? Case-sensitive: normalize first if needed. */
export function isIsin(value: string): boolean {
  return ISIN_PATTERN.test(value);
}

/** Issuer country from the ISIN (its first two letters), or `null` if it is not an ISIN. */
export function isinCountry(value: string): string | null {
  return isIsin(value) ? value.slice(0, 2) : null;
}

/**
 * Default values for a new income entry of a position. A ticker shaped like an ISIN (imported
 * positions) yields the ISIN and the issuer country for its dividends.
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
