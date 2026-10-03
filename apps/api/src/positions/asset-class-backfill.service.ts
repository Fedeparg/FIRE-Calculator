import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { AssetClass } from '@sextante/core/portfolio/types';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { positions } from '../db/schema.js';
import { INSTRUMENT_SEARCH, type InstrumentSearchProvider, type InstrumentType } from '../prices/instrument-search.js';

/** Tipo del buscador → clase de activo de la declaración (el mismo criterio que el alta manual). */
const ASSET_CLASS_OF: Record<InstrumentType, AssetClass> = {
  equity: 'stock',
  etf: 'fund',
  fund: 'fund',
  crypto: 'other',
  index: 'other',
  currency: 'other',
  other: 'other',
};

/** Tope de símbolos por ejecución: el buscador es de Yahoo y rate-limita en ráfaga. */
const MAX_TICKERS_PER_RUN = 40;
const SEARCH_DELAY_MS = 400;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Da clase de activo a las posiciones que no la tienen (anteriores a guardarla, o dadas de alta
 * tecleando el símbolo) con el tipo que devuelve el buscador de instrumentos. Sin ella, sus ventas
 * salen "sin clasificar" en la declaración. El usuario puede cambiarla después en la posición.
 */
@Injectable()
export class AssetClassBackfillService {
  private readonly logger = new Logger(AssetClassBackfillService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(INSTRUMENT_SEARCH) private readonly search: InstrumentSearchProvider,
  ) {}

  /** Devuelve cuántas posiciones ha clasificado. */
  async classifyMissing(): Promise<number> {
    const rows = await this.db
      .selectDistinct({ ticker: positions.ticker })
      .from(positions)
      .where(isNull(positions.assetClass))
      .limit(MAX_TICKERS_PER_RUN);

    let classified = 0;
    for (const [i, { ticker }] of rows.entries()) {
      if (i > 0) await delay(SEARCH_DELAY_MS);
      const assetClass = await this.classify(ticker);
      if (!assetClass) continue;
      const updated = await this.db
        .update(positions)
        .set({ assetClass })
        .where(and(eq(positions.ticker, ticker), isNull(positions.assetClass)))
        .returning({ id: positions.id });
      classified += updated.length;
    }
    if (classified > 0) this.logger.log(`Clase de activo deducida para ${classified} posiciones`);
    return classified;
  }

  /** Por ISIN vale el primer resultado; por símbolo, solo el que coincide exactamente. */
  private async classify(ticker: string): Promise<AssetClass | null> {
    const results = await this.search.search(ticker);
    const match = ISIN.test(ticker) ? results[0] : results.find((r) => r.symbol.toUpperCase() === ticker.toUpperCase());
    return match ? ASSET_CLASS_OF[match.type] : null;
  }
}
