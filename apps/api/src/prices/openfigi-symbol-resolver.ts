import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';

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

/** Forma de un ISIN: 2 letras (país) + 9 alfanuméricos + 1 dígito de control. */
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
/** Endpoint v3 de OpenFIGI (v2 EOL 2026-07-01). POST con cuerpo JSON. */
const OPENFIGI_MAPPING_URL = 'https://api.openfigi.com/v3/mapping';
const OPENFIGI_TIMEOUT_MS = 8_000;
/**
 * Sufijos de Yahoo a probar, en orden de preferencia para un europeo (EUR primero; Londres, en
 * GBp, al final). Los exchCode de OpenFIGI son códigos Bloomberg que no mapean limpio a Yahoo
 * (hay basura tipo XH/XF): se generan candidatos ticker×sufijo y la fuente decide cuál cotiza.
 */
const YAHOO_SUFFIXES = ['.AS', '.DE', '.MI', '.PA', '.MC', '.SW', '.L'];
/** Tope de candidatos a validar por consulta (acota el tráfico en un fallo de cobertura). */
const MAX_CANDIDATES = 12;
/** Pausa entre validaciones: evita ráfagas que disparen el 429 de Yahoo. */
const VALIDATION_DELAY_MS = 400;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Resultado de consultar OpenFIGI por un ISIN. Distingue el "vacío" real del fallo transitorio. */
type OpenFigiOutcome =
  | { kind: 'matches'; tickers: string[] }
  | { kind: 'empty' } // OpenFIGI respondió pero sin coincidencias → no existe (cachear).
  | { kind: 'error' }; // red / HTTP / parseo → transitorio (NO cachear, reintentar luego).

interface OpenFigiMatch {
  ticker?: string;
}
interface OpenFigiResultItem {
  data?: OpenFigiMatch[];
  warning?: string;
}

/** Dedupe de tickers preservando el más frecuente primero (el listado principal repite). */
function rankTickers(tickers: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of tickers) {
    const tk = t.trim().toUpperCase();
    if (tk) counts.set(tk, (counts.get(tk) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tk]) => tk);
}

/** Candidatos para un ISIN: los tickers de OpenFIGI (top 3) × sufijos preferentes + bare. */
export function isinCandidates(tickers: string[]): string[] {
  const top = rankTickers(tickers).slice(0, 3);
  const out: string[] = [];
  for (const suffix of YAHOO_SUFFIXES) for (const tk of top) out.push(tk + suffix);
  for (const tk of top) out.push(tk); // bare al final (menor prioridad: riesgo de falso positivo)
  return [...new Set(out)].slice(0, MAX_CANDIDATES);
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

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
    @Inject(INSTRUMENT_SEARCH) private readonly search: InstrumentSearchProvider,
    config: ConfigService<Env, true>,
  ) {
    this.apiKey = config.get('OPENFIGI_API_KEY', { infer: true }) || undefined;
  }

  async resolveCached(tickerOrIsin: string): Promise<string | null> {
    const query = normalizeQuery(tickerOrIsin);
    if (!query) return null;
    const cached = await this.lookup(query);
    return cached ?? null;
  }

  async resolve(tickerOrIsin: string): Promise<string | null> {
    const query = normalizeQuery(tickerOrIsin);
    if (!query) return null;

    const cached = await this.lookup(query);
    if (cached !== undefined) return cached; // hit: símbolo resuelto o null (no encontrado).

    if (ISIN_RE.test(query)) {
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
      const symbol = await this.firstThatPrices(isinCandidates(outcome.tickers));
      if (symbol) {
        await this.cache(query, symbol, 'openfigi');
        return symbol;
      }
      // Coincidencias sin cotización: hueco de cobertura o 429. No se cachea; se reintenta.
      this.logger.warn(`OpenFIGI ${query}: ${outcome.tickers.length} tickers, ninguno cotiza`);
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
    for (let i = 0; i < candidates.length; i++) {
      if (i > 0) await delay(VALIDATION_DELAY_MS);
      const quotes = await this.provider.getQuotes([candidates[i]]);
      if (quotes.has(candidates[i])) return candidates[i];
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
    return rows.length ? rows[0].symbol : undefined;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENFIGI_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['X-OPENFIGI-APIKEY'] = this.apiKey;
      const res = await fetch(OPENFIGI_MAPPING_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`OpenFIGI ${isin}: HTTP ${res.status}`);
        return { kind: 'error' };
      }
      const body = (await res.json()) as OpenFigiResultItem[];
      const item = Array.isArray(body) ? body[0] : undefined;
      const data = item?.data;
      if (!data || data.length === 0) return { kind: 'empty' };
      const tickers = data.map((d) => d.ticker).filter((t): t is string => Boolean(t));
      return tickers.length ? { kind: 'matches', tickers } : { kind: 'empty' };
    } catch (error) {
      this.logger.warn(`OpenFIGI ${isin}: ${(error as Error).message}`);
      return { kind: 'error' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
