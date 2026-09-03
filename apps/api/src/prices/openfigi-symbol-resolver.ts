import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { instruments } from '../db/schema.js';
import { PRICE_PROVIDER, type PriceProvider } from './price-provider.interface.js';
import { normalizeQuery, type SymbolResolver } from './symbol-resolver.js';

/** Forma de un ISIN: 2 letras (país) + 9 alfanuméricos + 1 dígito de control. */
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
/** Endpoint v3 de OpenFIGI (v2 EOL 2026-07-01). POST con cuerpo JSON. */
const OPENFIGI_MAPPING_URL = 'https://api.openfigi.com/v3/mapping';
const OPENFIGI_TIMEOUT_MS = 8_000;
/**
 * Sufijos de Yahoo a probar, en orden de preferencia para un usuario europeo (denominación
 * en EUR primero): Ámsterdam, Xetra, Milán, París, Madrid, Suiza y, por último, Londres
 * (en GBp). OpenFIGI da ticker + exchCode, pero los exchCode son códigos Bloomberg que no
 * mapean limpio a Yahoo (hay códigos "basura" tipo XH/XF); por eso NO confiamos en ellos:
 * generamos candidatos ticker×sufijo y dejamos que la fuente decida cuál cotiza de verdad.
 */
const YAHOO_SUFFIXES = ['.AS', '.DE', '.MI', '.PA', '.MC', '.SW', '.L'];
/** Tope de candidatos a validar por consulta (acota el tráfico en un fallo de cobertura). */
const MAX_CANDIDATES = 12;
/** Pausa entre validaciones de candidatos: evita ráfagas que disparen el 429 de Yahoo. */
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

/**
 * Símbolos de cripto que en Yahoo SON un par "<T>-USD", pero cuyo ticker suelto colisiona
 * con un valor bursátil real (p. ej. "BTC" cotiza como el ETF Grayscale Bitcoin Mini Trust a
 * ~26 US$, no como Bitcoin a ~60 000 US$). El flujo normal de alta usa el buscador y guarda
 * ya el símbolo exacto ("BTC-USD"), así que esto es una RED DE SEGURIDAD para tickers sueltos
 * que llegan por otra vía (datos antiguos, alta por API/MCP): fuerza el par y NO cae al bare.
 */
export const CRYPTO_TICKERS = new Set([
  'BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'USDC', 'ADA', 'AVAX', 'DOGE',
  'DOT', 'TRX', 'LINK', 'MATIC', 'TON', 'SHIB', 'LTC', 'BCH', 'XLM', 'ATOM',
  'XMR', 'ETC', 'NEAR', 'ALGO', 'FIL', 'ICP', 'APT', 'ARB', 'OP', 'UNI',
]);

/** Candidatos para un ticker suelto: bare primero (US/símbolo ya completo), luego sufijos. */
export function tickerCandidates(query: string): string[] {
  // Si ya parece un símbolo de Yahoo (EUNL.DE, BTC-USD), no inventamos sufijos.
  if (query.includes('.') || query.includes('-')) return [query];
  // Cripto conocida: NO probamos el bare (colisiona con un valor real). Solo el par "-USD";
  // si no cotizara, preferimos no resolver antes que cachear el instrumento equivocado.
  if (CRYPTO_TICKERS.has(query)) return [`${query}-USD`];
  const out = [query, ...YAHOO_SUFFIXES.map((s) => query + s)];
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * Resolver real: ISIN/ticker → símbolo de Yahoo, vía OpenFIGI (para ISIN) + validación
 * contra la propia fuente de precios (el candidato gana solo si COTIZA de verdad). Cachea
 * permanentemente en `instruments`: las resoluciones positivas y los "no encontrado" reales
 * (OpenFIGI sin coincidencias); los fallos transitorios NO se cachean para no bloquear un
 * símbolo válido por un rate-limit puntual. Ver `_local/datos-inversiones-api.md`.
 */
@Injectable()
export class OpenFigiSymbolResolver implements SymbolResolver {
  private readonly logger = new Logger(OpenFigiSymbolResolver.name);
  private readonly apiKey: string | undefined;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('OPENFIGI_API_KEY')?.trim() || undefined;
  }

  /** Solo caché (ruta de lectura del usuario): nunca llama a OpenFIGI ni a la fuente. */
  async resolveCached(tickerOrIsin: string): Promise<string | null> {
    const query = normalizeQuery(tickerOrIsin);
    if (!query) return null;
    const cached = await this.lookup(query);
    return cached ?? null;
  }

  /** Resolución completa: cache-first; en miss consulta OpenFIGI, valida contra la fuente y cachea. */
  async resolve(tickerOrIsin: string): Promise<string | null> {
    const query = normalizeQuery(tickerOrIsin);
    if (!query) return null;

    const cached = await this.lookup(query);
    if (cached !== undefined) return cached; // hit: símbolo resuelto o null (no encontrado).

    if (ISIN_RE.test(query)) {
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
      // Hubo coincidencias pero ninguna cotizó ahora: posible hueco de cobertura o 429.
      // No cacheamos (transient-safe): se reintenta en el próximo refresco.
      this.logger.warn(`OpenFIGI ${query}: ${outcome.tickers.length} tickers, ninguno cotiza`);
      return null;
    }

    // Ticker suelto: lo más común es que ya sea un símbolo de Yahoo (AAPL, EUNL.DE, BTC-USD).
    const symbol = await this.firstThatPrices(tickerCandidates(query));
    if (symbol) {
      await this.cache(query, symbol, 'identity');
      return symbol;
    }
    return null; // sin cotización: no cacheamos (puede ser typo o transitorio).
  }

  /** Devuelve el primer candidato que COTIZA en la fuente (orden = prioridad), o null. */
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
