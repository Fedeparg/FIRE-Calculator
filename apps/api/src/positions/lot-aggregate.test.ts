import { describe, expect, it } from 'vitest';

import {
  aggregateLots,
  formatDecimal,
  parseDecimal,
  type AggregatableLot,
  LotAggregateError,
} from './lot-aggregate.js';

/** Builds a minimal lot; `tradedAt` sets the order (and `createdAt` breaks ties). */
let seq = 0;
function lot(partial: {
  kind?: 'buy' | 'sell';
  quantity: string;
  price?: string;
  tradedAt?: string;
  createdAt?: Date;
  id?: string;
}): AggregatableLot {
  seq += 1;
  return {
    id: partial.id ?? `lot-${String(seq).padStart(4, '0')}`,
    kind: partial.kind ?? 'buy',
    quantity: partial.quantity,
    price: partial.price ?? '100.000000',
    tradedAt: partial.tradedAt ?? '2026-01-01',
    createdAt: partial.createdAt ?? new Date(Date.UTC(2026, 0, 1, 0, 0, seq)),
  };
}

describe('parseDecimal / formatDecimal', () => {
  it('round-trips without losing digits', () => {
    expect(formatDecimal(parseDecimal('123.456789', 6), 6)).toBe('123.456789');
    expect(formatDecimal(parseDecimal('0.000001', 6), 6)).toBe('0.000001');
    expect(formatDecimal(parseDecimal('-5', 6), 6)).toBe('-5.000000');
  });

  it('pads and truncates decimals with half-up rounding', () => {
    expect(formatDecimal(parseDecimal('1.5', 6), 6)).toBe('1.500000');
    expect(formatDecimal(parseDecimal('1.0000005', 6), 6)).toBe('1.000001');
    expect(formatDecimal(parseDecimal('1.0000004', 6), 6)).toBe('1.000000');
  });

  it('rejects anything that is not a plain decimal (no exponential notation)', () => {
    expect(() => parseDecimal('1e-7', 6)).toThrow(LotAggregateError);
    expect(() => parseDecimal('', 6)).toThrow(LotAggregateError);
    expect(() => parseDecimal('abc', 6)).toThrow(LotAggregateError);
  });
});

describe('aggregateLots', () => {
  it('with no lots leaves the position at zero', () => {
    expect(aggregateLots([])).toEqual({
      quantity: '0.000000',
      avgPrice: '0.000000',
      cost: '0.000000',
    });
  });

  it("a single buy yields that buy's quantity and price (the backfill case)", () => {
    expect(aggregateLots([lot({ quantity: '12.500000', price: '95.420000' })])).toMatchObject({
      quantity: '12.500000',
      avgPrice: '95.420000',
    });
  });

  it('averages two buys with weighting', () => {
    const result = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ quantity: '10', price: '200', tradedAt: '2026-02-01' }),
    ]);

    expect(result.quantity).toBe('20.000000');
    expect(result.avgPrice).toBe('150.000000');
    expect(result.cost).toBe('3000.000000');
  });

  it('a sell lowers the quantity but does NOT move the average price (moving average cost)', () => {
    const result = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ kind: 'sell', quantity: '4', price: '180', tradedAt: '2026-02-01' }),
    ]);

    expect(result.quantity).toBe('6.000000');
    expect(result.avgPrice).toBe('100.000000');
    expect(result.cost).toBe('600.000000');
  });

  it('buy-sell-buy gives the moving average cost, not the mean of the buys', () => {
    // 10@100 → sell 5 → buy 5@200. Open cost = 500 + 1000 = 1500 over 10 shares.
    const result = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ kind: 'sell', quantity: '5', price: '120', tradedAt: '2026-02-01' }),
      lot({ quantity: '5', price: '200', tradedAt: '2026-03-01' }),
    ]);

    expect(result.quantity).toBe('10.000000');
    // The weighted mean of ALL buys would give 133.333333: that would be wrong.
    expect(result.avgPrice).toBe('150.000000');
  });

  it('selling everything leaves quantity and cost at exactly zero', () => {
    const result = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ kind: 'sell', quantity: '10', price: '130', tradedAt: '2026-02-01' }),
    ]);

    expect(result).toEqual({
      quantity: '0.000000',
      avgPrice: '0.000000',
      cost: '0.000000',
    });
  });

  it('sorts by date even if the lots arrive out of order', () => {
    const chronological = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ kind: 'sell', quantity: '5', price: '120', tradedAt: '2026-02-01' }),
      lot({ quantity: '5', price: '200', tradedAt: '2026-03-01' }),
    ]);
    const shuffled = aggregateLots([
      lot({ quantity: '5', price: '200', tradedAt: '2026-03-01' }),
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ kind: 'sell', quantity: '5', price: '120', tradedAt: '2026-02-01' }),
    ]);

    expect(shuffled).toEqual(chronological);
  });

  it('breaks ties between lots on the SAME day by createdAt (deterministic result)', () => {
    const day = '2026-01-10';
    const first = lot({
      quantity: '10',
      price: '100',
      tradedAt: day,
      createdAt: new Date('2026-01-10T09:00:00Z'),
    });
    const second = lot({
      kind: 'sell',
      quantity: '10',
      price: '120',
      tradedAt: day,
      createdAt: new Date('2026-01-10T10:00:00Z'),
    });

    // Whatever the input order, the sell goes AFTER the buy: it does not go negative.
    expect(aggregateLots([second, first]).quantity).toBe('0.000000');
    expect(aggregateLots([first, second]).quantity).toBe('0.000000');
  });

  it('does NOT lose precision where floating-point arithmetic would', () => {
    // 0.1 + 0.2 in binary gives 0.30000000000000004; here it must give exactly 0.3.
    const result = aggregateLots([
      lot({ quantity: '0.1', price: '1', tradedAt: '2026-01-01' }),
      lot({ quantity: '0.2', price: '1', tradedAt: '2026-01-02' }),
    ]);

    expect(result.quantity).toBe('0.300000');
    expect(result.avgPrice).toBe('1.000000');
  });

  it('keeps the average price exact in a case floating point would shift', () => {
    // 3 buys of 1 share at 0.1 / 0.2 / 0.3: cost exactly 0.6 and average exactly 0.2.
    const result = aggregateLots([
      lot({ quantity: '1', price: '0.1', tradedAt: '2026-01-01' }),
      lot({ quantity: '1', price: '0.2', tradedAt: '2026-01-02' }),
      lot({ quantity: '1', price: '0.3', tradedAt: '2026-01-03' }),
    ]);

    expect(result.cost).toBe('0.600000');
    expect(result.avgPrice).toBe('0.200000');
  });

  describe('sell rounding tolerance (10⁻⁶)', () => {
    const buy = lot({ quantity: '5', price: '100', tradedAt: '2026-01-01' });

    it('an excess of exactly 1 unit at scale 6 leaves the position at 0', () => {
      const result = aggregateLots([
        buy,
        lot({ kind: 'sell', quantity: '5.000001', price: '100', tradedAt: '2026-02-01' }),
      ]);
      expect(result).toEqual({ quantity: '0.000000', avgPrice: '0.000000', cost: '0.000000' });
    });

    it('an excess of 2 units is already an oversell and fails', () => {
      expect(() =>
        aggregateLots([buy, lot({ kind: 'sell', quantity: '5.000002', price: '100', tradedAt: '2026-02-01' })]),
      ).toThrow(expect.objectContaining({ code: 'NEGATIVE_QUANTITY' }));
    });

    it('an exact sell is unchanged', () => {
      const result = aggregateLots([buy, lot({ kind: 'sell', quantity: '5', price: '100', tradedAt: '2026-02-01' })]);
      expect(result.quantity).toBe('0.000000');
    });

    it('after clearing the remainder, a later buy starts from zero', () => {
      const result = aggregateLots([
        buy,
        lot({ kind: 'sell', quantity: '5.000001', price: '100', tradedAt: '2026-02-01' }),
        lot({ quantity: '2', price: '50', tradedAt: '2026-03-01' }),
      ]);
      expect(result).toMatchObject({ quantity: '2.000000', avgPrice: '50.000000' });
    });
  });

  it('rejects a sell that would leave the position negative (no shorts)', () => {
    expect(() =>
      aggregateLots([
        lot({ quantity: '5', price: '100', tradedAt: '2026-01-01' }),
        lot({ kind: 'sell', quantity: '6', price: '100', tradedAt: '2026-02-01' }),
      ]),
    ).toThrow(expect.objectContaining({ code: 'NEGATIVE_QUANTITY' }));
  });

  it('rejects a QUANTITY that would not fit in numeric(18,6)', () => {
    expect(() =>
      aggregateLots([
        lot({ quantity: '999999999999', price: '1', tradedAt: '2026-01-01' }),
        lot({ quantity: '999999999999', price: '1', tradedAt: '2026-01-02' }),
      ]),
    ).toThrow(expect.objectContaining({ code: 'OVERFLOW' }));
  });

  it('accepts a huge cost as long as quantity and average price fit in their columns', () => {
    // The cost (10¹² · 10¹² = 10²⁴) has no column: only quantity and average are stored.
    const result = aggregateLots([lot({ quantity: '999999999999', price: '999999999999', tradedAt: '2026-01-01' })]);

    expect(result.quantity).toBe('999999999999.000000');
    expect(result.avgPrice).toBe('999999999999.000000');
  });

  it('a price of 0 (e.g. a free share grant) is valid and lowers the average', () => {
    const result = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ quantity: '10', price: '0', tradedAt: '2026-01-02' }),
    ]);

    expect(result.avgPrice).toBe('50.000000');
  });
});
