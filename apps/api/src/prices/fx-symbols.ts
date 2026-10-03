import { SUPPORTED_CURRENCIES } from '@sextante/core/contracts';

/** Divisa puente de las tasas FX: todo se cotiza contra USD y se pivota por él. */
export const FX_QUOTE = 'USD';

/** Símbolo de Yahoo del par CCY→USD (= USD por unidad de CCY). USD consigo mismo es 1. */
export function fxSymbol(currency: string): string {
  return `${currency}${FX_QUOTE}=X`;
}

/**
 * Divisa de cada par FX que se cachea: una por divisa soportada salvo USD, que no necesita par.
 * Constante de módulo: antes se reconstruía en cada lectura de tasas y de series.
 */
export const FX_CURRENCY_BY_SYMBOL: ReadonlyMap<string, string> = new Map(
  SUPPORTED_CURRENCIES.filter((currency) => currency !== FX_QUOTE).map((currency) => [fxSymbol(currency), currency]),
);

/** Los pares FX que se refrescan siempre (el total agregado de la cartera los necesita). */
export const FX_SYMBOLS: readonly string[] = [...FX_CURRENCY_BY_SYMBOL.keys()];
