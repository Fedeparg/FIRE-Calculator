import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, inArray } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module';
import { instrumentPrices, positions } from '../db/schema';
import { PRICE_PROVIDER, type PriceProvider } from './price-provider.interface';
import { SYMBOL_RESOLVER, type SymbolResolver } from './symbol-resolver';

/** Precio de un instrumento tal y como lo consume el frontend (lectura desde nuestra DB). */
export interface PriceInfo {
  symbol: string;
  close: number;
  currency: string;
  date: string;
}

/** Resumen de una ejecución del refresco (para logs y el trigger manual de dev). */
export interface RefreshSummary {
  symbols: number;
  fetched: number;
  missing: string[];
}

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
    @Inject(SYMBOL_RESOLVER) private readonly resolver: SymbolResolver,
  ) {}

  /**
   * Refresca el precio de todos los símbolos en uso (distintos `ticker` de TODAS las
   * posiciones), llamando a la fuente externa y guardando en `instrument_prices`. Es lo
   * que ejecuta el cron diario; el usuario nunca dispara esto al navegar. Tolerante a
   * fallos: un símbolo que no resuelva o que la fuente no devuelva no rompe el resto.
   */
  async refreshAll(): Promise<RefreshSummary> {
    const tickers = await this.distinctTickers();
    const symbols = await this.resolveSymbols(tickers);

    if (symbols.length === 0) {
      this.logger.log('Refresco de precios: no hay símbolos que actualizar');
      return { symbols: 0, fetched: 0, missing: [] };
    }

    const quotes = await this.provider.getQuotes(symbols);
    for (const quote of quotes.values()) {
      await this.db
        .insert(instrumentPrices)
        .values({
          symbol: quote.symbol,
          date: quote.date,
          close: quote.close.toString(),
          currency: quote.currency,
          source: this.provider.name,
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [instrumentPrices.symbol, instrumentPrices.date],
          set: {
            close: quote.close.toString(),
            currency: quote.currency,
            source: this.provider.name,
            fetchedAt: new Date(),
          },
        });
    }

    const missing = symbols.filter((s) => !quotes.has(s));
    this.logger.log(
      `Refresco de precios (${this.provider.name}): ${quotes.size}/${symbols.length} símbolos` +
        (missing.length ? ` — sin datos: ${missing.join(', ')}` : ''),
    );
    return { symbols: symbols.length, fetched: quotes.size, missing };
  }

  /**
   * Devuelve el último precio conocido (desde nuestra DB) para cada ticker pedido. Resuelve
   * ticker → símbolo y mapea el resultado de vuelta al ticker original, para que el frontend
   * lo case con sus posiciones. Los tickers sin precio en caché simplemente no aparecen.
   */
  async getPrices(tickers: string[]): Promise<Map<string, PriceInfo>> {
    const tickerToSymbol = new Map<string, string>();
    for (const ticker of tickers) {
      const symbol = await this.resolver.resolve(ticker);
      if (symbol) tickerToSymbol.set(ticker, symbol);
    }

    const symbols = [...new Set(tickerToSymbol.values())];
    const out = new Map<string, PriceInfo>();
    if (symbols.length === 0) return out;

    const rows = await this.db
      .select()
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, symbols))
      .orderBy(instrumentPrices.symbol, desc(instrumentPrices.date));

    // El último por símbolo: primera fila de cada símbolo (orden date DESC).
    const latest = new Map<string, PriceInfo>();
    for (const row of rows) {
      if (!latest.has(row.symbol)) {
        latest.set(row.symbol, {
          symbol: row.symbol,
          close: Number(row.close),
          currency: row.currency,
          date: row.date,
        });
      }
    }

    for (const [ticker, symbol] of tickerToSymbol) {
      const price = latest.get(symbol);
      if (price) out.set(ticker, price);
    }
    return out;
  }

  /** `ticker` distintos de todas las posiciones (símbolos en uso, compartidos entre usuarios). */
  private async distinctTickers(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ ticker: positions.ticker }).from(positions);
    return rows.map((r) => r.ticker);
  }

  /** Resuelve una lista de tickers a símbolos de la fuente, sin duplicados ni nulos. */
  private async resolveSymbols(tickers: string[]): Promise<string[]> {
    const symbols = new Set<string>();
    for (const ticker of tickers) {
      const symbol = await this.resolver.resolve(ticker);
      if (symbol) symbols.add(symbol);
    }
    return [...symbols];
  }
}
