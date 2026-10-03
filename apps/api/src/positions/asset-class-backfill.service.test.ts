import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { positions } from '../db/schema.js';
import type { InstrumentSearchProvider, InstrumentSearchResult } from '../prices/instrument-search.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { AssetClassBackfillService } from './asset-class-backfill.service.js';

const results: Record<string, InstrumentSearchResult[]> = {
  IE00BK5BQT80: [{ symbol: 'VWCE.DE', name: 'Vanguard FTSE All-World', type: 'etf', exchange: 'GER' }],
  AAPL: [
    { symbol: 'AAPL.MX', name: 'Apple', type: 'equity', exchange: 'MEX' },
    { symbol: 'AAPL', name: 'Apple', type: 'equity', exchange: 'NMS' },
  ],
  XYZ: [{ symbol: 'XYZW', name: 'Something else', type: 'equity', exchange: null }],
};
const search: InstrumentSearchProvider = { search: (q) => Promise.resolve(results[q] ?? []) };

describe('AssetClassBackfillService (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: AssetClassBackfillService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = new AssetClassBackfillService(db, search);
  });
  afterEach(() => resetDb(db));
  afterAll(() => close());

  it('classifies by ISIN with the first result and by symbol only on an exact match, leaving classified ones untouched', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await db.insert(positions).values([
      { userId, ticker: 'IE00BK5BQT80', quantity: '1', avgPrice: '1' },
      { userId, ticker: 'AAPL', quantity: '1', avgPrice: '1', broker: 'A' },
      { userId, ticker: 'AAPL', quantity: '1', avgPrice: '1', broker: 'B', assetClass: 'other' },
      { userId, ticker: 'XYZ', quantity: '1', avgPrice: '1' },
    ]);

    expect(await service.classifyMissing()).toBe(2);
    const rows = await db
      .select({ ticker: positions.ticker, broker: positions.broker, assetClass: positions.assetClass })
      .from(positions);
    const byKey = new Map(rows.map((r) => [`${r.ticker}|${r.broker ?? ''}`, r.assetClass]));
    expect(byKey.get('IE00BK5BQT80|')).toBe('fund');
    expect(byKey.get('AAPL|A')).toBe('stock');
    expect(byKey.get('AAPL|B')).toBe('other');
    expect(byKey.get('XYZ|')).toBeNull();
  });
});
