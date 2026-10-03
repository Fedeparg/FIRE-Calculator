import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { AssetClass } from '@sextante/core/portfolio/types';
import { isIsin } from '@sextante/core/portfolio/isin';
import { sleep } from '../common/http.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { positions } from '../db/schema.js';
import { INSTRUMENT_SEARCH, type InstrumentSearchProvider, type InstrumentType } from '../prices/instrument-search.js';

/** Search result type → tax-return asset class (the same criterion as manual creation). */
const ASSET_CLASS_OF: Record<InstrumentType, AssetClass> = {
  equity: 'stock',
  etf: 'fund',
  fund: 'fund',
  crypto: 'other',
  index: 'other',
  currency: 'other',
  other: 'other',
};

/** Cap on symbols per run: the search is Yahoo's and it rate-limits bursts. */
const MAX_TICKERS_PER_RUN = 40;
const SEARCH_DELAY_MS = 400;

/**
 * Assigns an asset class to positions that lack one (created before it was stored, or by typing
 * the symbol) using the type returned by the instrument search. Without it, their sales show up as
 * "unclassified" in the tax return. The user can change it later on the position.
 */
@Injectable()
export class AssetClassBackfillService {
  private readonly logger = new Logger(AssetClassBackfillService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(INSTRUMENT_SEARCH) private readonly search: InstrumentSearchProvider,
  ) {}

  /** Returns how many positions it classified. */
  async classifyMissing(): Promise<number> {
    const rows = await this.db
      .selectDistinct({ ticker: positions.ticker })
      .from(positions)
      .where(isNull(positions.assetClass))
      .limit(MAX_TICKERS_PER_RUN);

    let classified = 0;
    for (const [i, { ticker }] of rows.entries()) {
      if (i > 0) await sleep(SEARCH_DELAY_MS);
      const assetClass = await this.classify(ticker);
      if (!assetClass) continue;
      const updated = await this.db
        .update(positions)
        .set({ assetClass })
        .where(and(eq(positions.ticker, ticker), isNull(positions.assetClass)))
        .returning({ id: positions.id });
      classified += updated.length;
    }
    if (classified > 0) this.logger.log(`Asset class inferred for ${classified} positions`);
    return classified;
  }

  /** By ISIN the first result is used; by symbol, only the exact match. */
  private async classify(ticker: string): Promise<AssetClass | null> {
    const results = await this.search.search(ticker);
    const match = isIsin(ticker) ? results[0] : results.find((r) => r.symbol.toUpperCase() === ticker.toUpperCase());
    return match ? ASSET_CLASS_OF[match.type] : null;
  }
}
