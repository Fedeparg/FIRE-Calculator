import { Injectable } from '@nestjs/common';

/**
 * Traduce lo que el usuario teclea (`positions.ticker`: un símbolo o un ISIN) al símbolo
 * que entiende la fuente de precios (Yahoo: "AAPL", "EUNL.DE", "BTC-USD").
 *
 * Hoy es IDENTIDAD: asumimos que el usuario introduce ya un símbolo válido de Yahoo. El
 * paso real (ISIN/ticker → símbolo+mercado) lo hará OpenFIGI v3 más adelante, cacheando el
 * resultado (un ISIN no cambia de símbolo). Esta interfaz es ese hueco: cuando entre
 * OpenFIGI, solo se sustituye la implementación; ni `PricesService` ni el esquema cambian.
 * Ver `_local/datos-inversiones-api.md`.
 */
export interface SymbolResolver {
  /** Devuelve el símbolo de la fuente de precios para un ticker/ISIN, o `null` si no resuelve. */
  resolve(tickerOrIsin: string): Promise<string | null>;
}

/** Token de inyección para el resolver activo. */
export const SYMBOL_RESOLVER = Symbol('SYMBOL_RESOLVER');

/**
 * Resolver de identidad: normaliza (trim + mayúsculas) y devuelve el ticker tal cual,
 * suponiendo que ya es un símbolo de Yahoo. Suficiente hasta integrar OpenFIGI.
 */
@Injectable()
export class IdentitySymbolResolver implements SymbolResolver {
  resolve(tickerOrIsin: string): Promise<string | null> {
    const symbol = tickerOrIsin.trim().toUpperCase();
    return Promise.resolve(symbol.length > 0 ? symbol : null);
  }
}
