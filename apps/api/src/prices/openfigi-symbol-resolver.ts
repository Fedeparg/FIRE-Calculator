import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';

import { isIsin } from '@sextante/core/portfolio/isin';
import type { Env } from '../config/env.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { instruments } from '../db/schema.js';
import {
  INSTRUMENT_SEARCH,
  type InstrumentSearchProvider,
  type InstrumentSearchResult,
  type InstrumentType,
} from './instrument-search.js';
import { PRICE_PROVIDER, type PriceProvider } from './price-provider.interface.js';
import { normalizeQuery, type SymbolResolver } from './symbol-resolver.js';
import { fetchJson, sleep } from '../common/http.js';

/** Endpoint v3 de OpenFIGI (v2 EOL 2026-07-01). POST con cuerpo JSON. */
const OPENFIGI_MAPPING_URL = 'https://api.openfigi.com/v3/mapping';
const OPENFIGI_TIMEOUT_MS = 8_000;
/** Sufijos de Yahoo en orden de preferencia para un europeo (EUR primero; Londres, en GBp, al final). */
const YAHOO_SUFFIXES = ['.AS', '.DE', '.MI', '.PA', '.MC', '.SW', '.L'];
/**
 * exchCode de Bloomberg (OpenFIGI) → sufijo de Yahoo; '' = EE. UU., donde Yahoo usa el ticker
 * sin sufijo. Un ticker solo se prueba con el sufijo de la bolsa en la que OpenFIGI lo lista: el
 * mismo ticker en otra bolsa puede ser otro producto (`AMZN.AS` es un ETP sobre Amazon a ~7 €,
 * no la acción). Los códigos que no están aquí (compuestos EO/EU, basura tipo XH/XF) se ignoran.
 */
const EXCHANGE_SUFFIXES: ReadonlyMap<string, string> = new Map([
  ['NA', '.AS'],
  ['GY', '.DE'],
  ['GR', '.DE'],
  ['IM', '.MI'],
  ['FP', '.PA'],
  ['SM', '.MC'],
  ['SQ', '.MC'],
  ['SW', '.SW'],
  ['SE', '.SW'],
  ['LN', '.L'],
  ['US', ''],
  ['UN', ''],
  ['UW', ''],
  ['UQ', ''],
  ['UA', ''],
  ['UR', ''],
  ['UP', ''],
  ['UV', ''],
]);
/** Orden de prueba de los sufijos: los europeos por preferencia y EE. UU. al final. */
const SUFFIX_ORDER = [...YAHOO_SUFFIXES, ''];
/** Tope de candidatos a validar por consulta (acota el tráfico en un fallo de cobertura). */
const MAX_CANDIDATES = 12;
/** Pausa entre validaciones: evita ráfagas que disparen el 429 de Yahoo. */
const VALIDATION_DELAY_MS = 400;
/**
 * Caché negativa en memoria de las consultas que no se resolvieron SIN dejar fila en
 * `instruments` (fallo transitorio, hueco de cobertura, ticker sin cotización). Sin ella, el
 * refresco horario las reintentaba contra OpenFIGI y Yahoo cada hora para siempre. Espera
 * exponencial: 1 h, 2 h, 4 h… hasta 24 h; se olvida al resolver. Se pierde al reiniciar, que es
 * aceptable: lo peor es un reintento de más.
 */
const NEGATIVE_BACKOFF_BASE_MS = 60 * 60_000;
const NEGATIVE_BACKOFF_MAX_MS = 24 * 60 * 60_000;
/** Tope de entradas para que una avalancha de consultas basura no haga crecer la memoria. */
const NEGATIVE_CACHE_MAX_ENTRIES = 1_000;

interface NegativeEntry {
  failures: number;
  nextTryAt: number;
}

/** Resultado de consultar OpenFIGI por un ISIN. Distingue el "vacío" real del fallo transitorio. */
type OpenFigiOutcome =
  | { kind: 'matches'; listings: OpenFigiListing[] }
  | { kind: 'empty' } // OpenFIGI respondió pero sin coincidencias → no existe (cachear).
  | { kind: 'error' }; // red / HTTP / parseo → transitorio (NO cachear, reintentar luego).

/** Un listado del instrumento en una bolsa, tal como lo da OpenFIGI. */
export interface OpenFigiListing {
  ticker: string;
  exchCode?: string;
}
interface OpenFigiResultItem {
  data?: Partial<OpenFigiListing>[];
  warning?: string;
}

/**
 * Candidatos para un ISIN: el ticker de cada listado con el sufijo de SU bolsa, en el orden de
 * `SUFFIX_ORDER`. Dentro de un mismo sufijo va primero el ticker más repetido (el listado
 * principal se repite en las sub-bolsas). Pura.
 */
export function isinCandidates(listings: readonly OpenFigiListing[]): string[] {
  const found = new Map<string, { rank: number; count: number }>();
  for (const { ticker, exchCode } of listings) {
    const suffix = exchCode ? EXCHANGE_SUFFIXES.get(exchCode.trim().toUpperCase()) : undefined;
    const tk = ticker.trim().toUpperCase();
    if (suffix === undefined || !tk) continue;
    const symbol = tk + suffix;
    const entry = found.get(symbol) ?? { rank: SUFFIX_ORDER.indexOf(suffix), count: 0 };
    entry.count += 1;
    found.set(symbol, entry);
  }
  // `sort` es estable: a igual sufijo y frecuencia se conserva el orden de OpenFIGI.
  return [...found.entries()]
    .sort(([, a], [, b]) => a.rank - b.rank || b.count - a.count)
    .map(([symbol]) => symbol)
    .slice(0, MAX_CANDIDATES);
}

/** Tipos de la búsqueda de Yahoo que pueden ser el instrumento de un ISIN. */
const SEARCH_TYPES = new Set<InstrumentType>(['equity', 'etf', 'fund']);
/** Tope de resultados de la búsqueda que se validan contra la fuente. */
const MAX_SEARCH_CANDIDATES = 5;

/**
 * Candidatos para un ISIN desde la búsqueda de Yahoo (acepta el ISIN y devuelve las
 * cotizaciones de ese instrumento): primero los mercados en euros, en el orden de
 * `YAHOO_SUFFIXES` (evita convertir divisas), luego el resto en el orden de Yahoo, que cubre
 * valores no europeos (p. ej. `.HK`). Pura.
 */
export function searchCandidates(results: readonly InstrumentSearchResult[]): string[] {
  const symbols = [
    ...new Set(results.filter((r) => SEARCH_TYPES.has(r.type)).map((r) => r.symbol.trim().toUpperCase())),
  ].filter(Boolean);
  const rank = (symbol: string): number => {
    const index = YAHOO_SUFFIXES.findIndex((suffix) => symbol.endsWith(suffix));
    return index === -1 ? YAHOO_SUFFIXES.length : index;
  };
  // `sort` es estable: a igual rango se conserva el orden de Yahoo.
  return symbols.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_SEARCH_CANDIDATES);
}

/**
 * Cripto que en Yahoo es un par "<T>-USD" pero cuyo ticker suelto colisiona con un valor real
 * (p. ej. "BTC" es el ETF Grayscale Bitcoin Mini Trust, ~26 US$, no Bitcoin). Red de seguridad
 * para tickers sueltos que llegan sin pasar por el buscador (datos antiguos, API/MCP): fuerza
 * el par y no cae al bare.
 */
export const CRYPTO_TICKERS = new Set([
  'BTC',
  'ETH',
  'USDT',
  'BNB',
  'SOL',
  'XRP',
  'USDC',
  'ADA',
  'AVAX',
  'DOGE',
  'DOT',
  'TRX',
  'LINK',
  'MATIC',
  'TON',
  'SHIB',
  'LTC',
  'BCH',
  'XLM',
  'ATOM',
  'XMR',
  'ETC',
  'NEAR',
  'ALGO',
  'FIL',
  'ICP',
  'APT',
  'ARB',
  'OP',
  'UNI',
]);

/** Candidatos para un ticker suelto: bare primero (US/símbolo ya completo), luego sufijos. */
export function tickerCandidates(query: string): string[] {
  // Si ya parece un símbolo de Yahoo (EUNL.DE, BTC-USD), no se inventan sufijos.
  if (query.includes('.') || query.includes('-')) return [query];
  // Cripto conocida: solo el par "-USD"; mejor no resolver que cachear el instrumento equivocado.
  if (CRYPTO_TICKERS.has(query)) return [`${query}-USD`];
  const out = [query, ...YAHOO_SUFFIXES.map((s) => query + s)];
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * Resolver ISIN/ticker → símbolo de Yahoo. Para un ISIN prueba primero la búsqueda de Yahoo y
 * luego OpenFIGI; un candidato gana solo si cotiza de verdad. La búsqueda va primero porque
 * OpenFIGI devuelve todos los listados (con tickers que Yahoo no conoce, como "VAPUUSD") y solo
 * se probaban sufijos europeos, dejando sin precio a ETFs con ticker por mercado y a valores
 * asiáticos. Cachea en `instruments` las resoluciones y los "no encontrado" reales; los fallos
 * transitorios no, para no bloquear un símbolo válido por un rate-limit. Ver
 * `_local/datos-inversiones-api.md`.
 */
@Injectable()
export class OpenFigiSymbolResolver implements SymbolResolver {
  private readonly logger = new Logger(OpenFigiSymbolResolver.name);
  private readonly apiKey: string | undefined;
  private readonly negative = new Map<string, NegativeEntry>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
    @Inject(INSTRUMENT_SEARCH) private readonly search: InstrumentSearchProvider,
    config: ConfigService<Env, true>,
  ) {
    this.apiKey = config.get('OPENFIGI_API_KEY', { infer: true }) || undefined;
  }

  async resolveCached(tickerOrIsin: string): Promise<string | null> {
    return (await this.resolveManyCached([tickerOrIsin])).get(tickerOrIsin) ?? null;
  }

  async resolveManyCached(tickersOrIsins: readonly string[]): Promise<Map<string, string | null>> {
    const queryByInput = new Map(tickersOrIsins.map((input) => [input, normalizeQuery(input)]));
    const queries = [...new Set(queryByInput.values())].filter(Boolean);
    const rows =
      queries.length === 0
        ? []
        : await this.db
            .select({ query: instruments.query, symbol: instruments.symbol })
            .from(instruments)
            .where(inArray(instruments.query, queries));
    const symbolByQuery = new Map(rows.map((row) => [row.query, row.symbol]));
    return new Map([...queryByInput].map(([input, query]) => [input, symbolByQuery.get(query) ?? null]));
  }

  async resolve(tickerOrIsin: string): Promise<string | null> {
    const query = normalizeQuery(tickerOrIsin);
    if (!query) return null;

    const cached = await this.lookup(query);
    if (cached !== undefined) return cached; // hit: símbolo resuelto o null (no encontrado).

    const backoff = this.negative.get(query);
    if (backoff && Date.now() < backoff.nextTryAt) return null;

    const symbol = await this.resolveUncached(query);
    if (symbol) this.negative.delete(query);
    else this.recordFailure(query);
    return symbol;
  }

  /** Apunta un fallo sin fila en caché y aplaza el siguiente intento (espera exponencial). */
  private recordFailure(query: string): void {
    const failures = (this.negative.get(query)?.failures ?? 0) + 1;
    const waitMs = Math.min(NEGATIVE_BACKOFF_BASE_MS * 2 ** (failures - 1), NEGATIVE_BACKOFF_MAX_MS);
    // Reinsertar la mueve al final: el `Map` conserva el orden, así que la primera es la más antigua.
    this.negative.delete(query);
    this.negative.set(query, { failures, nextTryAt: Date.now() + waitMs });
    if (this.negative.size > NEGATIVE_CACHE_MAX_ENTRIES) {
      const oldest = this.negative.keys().next().value;
      if (oldest !== undefined) this.negative.delete(oldest);
    }
  }

  /** Resolución contra las fuentes externas de una consulta sin fila en caché. */
  private async resolveUncached(query: string): Promise<string | null> {
    if (isIsin(query)) {
      // La búsqueda nunca lanza: ante un fallo devuelve [] y se sigue con OpenFIGI.
      const searched = await this.firstThatPrices(searchCandidates(await this.search.search(query)));
      if (searched) {
        await this.cache(query, searched, 'yahoo_search');
        return searched;
      }

      const outcome = await this.mapIsin(query);
      if (outcome.kind === 'error') return null; // transitorio: no cachear, reintentar.
      if (outcome.kind === 'empty') {
        await this.cache(query, null, 'not_found');
        return null;
      }
      const symbol = await this.firstThatPrices(isinCandidates(outcome.listings));
      if (symbol) {
        await this.cache(query, symbol, 'openfigi');
        return symbol;
      }
      // Coincidencias sin cotización: hueco de cobertura o 429. No se cachea; se reintenta.
      this.logger.warn(`OpenFIGI ${query}: ${outcome.listings.length} listados, ninguno cotiza`);
      return null;
    }

    // Ticker suelto: lo normal es que ya sea un símbolo de Yahoo.
    const symbol = await this.firstThatPrices(tickerCandidates(query));
    if (symbol) {
      await this.cache(query, symbol, 'identity');
      return symbol;
    }
    return null; // sin cotización: no se cachea (typo o transitorio).
  }

  /** Primer candidato que cotiza en la fuente (el orden es la prioridad), o null. */
  private async firstThatPrices(candidates: string[]): Promise<string | null> {
    for (const [i, candidate] of candidates.entries()) {
      if (i > 0) await sleep(VALIDATION_DELAY_MS);
      const quotes = await this.provider.getQuotes([candidate]);
      if (quotes.has(candidate)) return candidate;
    }
    return null;
  }

  /** Lee la caché. `undefined` = no hay fila (miss); `null` = no encontrado; string = símbolo. */
  private async lookup(query: string): Promise<string | null | undefined> {
    const rows = await this.db
      .select({ symbol: instruments.symbol })
      .from(instruments)
      .where(eq(instruments.query, query))
      .limit(1);
    return rows[0]?.symbol;
  }

  /** Upsert de la resolución (permanente). `symbol` null cachea un "no encontrado" real. */
  private async cache(query: string, symbol: string | null, source: string): Promise<void> {
    await this.db
      .insert(instruments)
      .values({ query, symbol, source, resolvedAt: new Date() })
      .onConflictDoUpdate({
        target: instruments.query,
        set: { symbol, source, resolvedAt: new Date() },
      });
  }

  /** Consulta OpenFIGI v3 por ISIN. Separa "sin coincidencias" (cachear) de "fallo" (reintentar). */
  private async mapIsin(isin: string): Promise<OpenFigiOutcome> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-OPENFIGI-APIKEY'] = this.apiKey;
    const result = await fetchJson(OPENFIGI_MAPPING_URL, {
      timeoutMs: OPENFIGI_TIMEOUT_MS,
      method: 'POST',
      headers,
      body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
    });
    if (!result.ok) {
      this.logger.warn(`OpenFIGI ${isin}: ${result.error}`);
      return { kind: 'error' };
    }
    const body = result.body as OpenFigiResultItem[];
    const item = Array.isArray(body) ? body[0] : undefined;
    const data = item?.data;
    if (!data || data.length === 0) return { kind: 'empty' };
    // OpenFIGI manda `null` en los campos que no tiene: se normaliza a ausente.
    const listings = data.flatMap(({ ticker, exchCode }) =>
      typeof ticker === 'string' && ticker
        ? [{ ticker, exchCode: typeof exchCode === 'string' ? exchCode : undefined }]
        : [],
    );
    return listings.length ? { kind: 'matches', listings } : { kind: 'empty' };
  }
}
