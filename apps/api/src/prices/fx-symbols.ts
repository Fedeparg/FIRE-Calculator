import { SUPPORTED_CURRENCIES } from '@sextante/core/contracts';

/** Bridge currency of the FX rates: everything is quoted against USD and pivots through it. */
export const FX_QUOTE = 'USD';

/** Yahoo symbol of the CCY→USD pair (= USD per unit of CCY). USD against itself is 1. */
export function fxSymbol(currency: string): string {
  return `${currency}${FX_QUOTE}=X`;
}

/**
 * Currency of each cached FX pair: one per supported currency except USD, which needs no pair.
 * Module constant: it used to be rebuilt on every read of rates and series.
 */
export const FX_CURRENCY_BY_SYMBOL: ReadonlyMap<string, string> = new Map(
  SUPPORTED_CURRENCIES.filter((currency) => currency !== FX_QUOTE).map((currency) => [fxSymbol(currency), currency]),
);

/** The FX pairs that are always refreshed (the aggregated portfolio total needs them). */
export const FX_SYMBOLS: readonly string[] = [...FX_CURRENCY_BY_SYMBOL.keys()];
