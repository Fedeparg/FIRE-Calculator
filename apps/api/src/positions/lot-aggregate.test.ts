import { describe, expect, it } from 'vitest';

import {
  aggregateLots,
  formatDecimal,
  parseDecimal,
  type AggregatableLot,
  LotAggregateError,
} from './lot-aggregate.js';

/** Construye un lote con lo mínimo; el orden lo fija `tradedAt` (y `createdAt` desempata). */
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
  it('convierte ida y vuelta sin perder dígitos', () => {
    expect(formatDecimal(parseDecimal('123.456789', 6), 6)).toBe('123.456789');
    expect(formatDecimal(parseDecimal('0.000001', 6), 6)).toBe('0.000001');
    expect(formatDecimal(parseDecimal('-5', 6), 6)).toBe('-5.000000');
  });

  it('rellena y recorta decimales con redondeo half-up', () => {
    expect(formatDecimal(parseDecimal('1.5', 6), 6)).toBe('1.500000');
    expect(formatDecimal(parseDecimal('1.0000005', 6), 6)).toBe('1.000001');
    expect(formatDecimal(parseDecimal('1.0000004', 6), 6)).toBe('1.000000');
  });

  it('rechaza lo que no sea un decimal plano (nada de notación exponencial)', () => {
    expect(() => parseDecimal('1e-7', 6)).toThrow(LotAggregateError);
    expect(() => parseDecimal('', 6)).toThrow(LotAggregateError);
    expect(() => parseDecimal('abc', 6)).toThrow(LotAggregateError);
  });
});

describe('aggregateLots', () => {
  it('sin lotes deja la posición a cero', () => {
    expect(aggregateLots([])).toEqual({
      quantity: '0.000000',
      avgPrice: '0.000000',
      cost: '0.000000',
    });
  });

  it('una sola compra es la cantidad y el precio de esa compra (caso del backfill)', () => {
    expect(aggregateLots([lot({ quantity: '12.500000', price: '95.420000' })])).toMatchObject({
      quantity: '12.500000',
      avgPrice: '95.420000',
    });
  });

  it('promedia dos compras de forma ponderada', () => {
    const result = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ quantity: '10', price: '200', tradedAt: '2026-02-01' }),
    ]);

    expect(result.quantity).toBe('20.000000');
    expect(result.avgPrice).toBe('150.000000');
    expect(result.cost).toBe('3000.000000');
  });

  it('una venta baja la cantidad pero NO mueve el precio medio (coste medio móvil)', () => {
    const result = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ kind: 'sell', quantity: '4', price: '180', tradedAt: '2026-02-01' }),
    ]);

    expect(result.quantity).toBe('6.000000');
    expect(result.avgPrice).toBe('100.000000');
    expect(result.cost).toBe('600.000000');
  });

  it('compra-venta-compra da coste medio móvil, no media de las compras', () => {
    // 10@100 → vende 5 → compra 5@200. Coste vivo = 500 + 1000 = 1500 sobre 10 títulos.
    const result = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ kind: 'sell', quantity: '5', price: '120', tradedAt: '2026-02-01' }),
      lot({ quantity: '5', price: '200', tradedAt: '2026-03-01' }),
    ]);

    expect(result.quantity).toBe('10.000000');
    // La media ponderada de TODAS las compras daría 133,333333: eso sería incorrecto.
    expect(result.avgPrice).toBe('150.000000');
  });

  it('vender todo deja cantidad y coste exactamente a cero', () => {
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

  it('ordena por fecha aunque los lotes lleguen desordenados', () => {
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

  it('desempata los lotes del MISMO día por createdAt (resultado determinista)', () => {
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

    // En cualquier orden de entrada, la venta va DESPUÉS de la compra: no da negativo.
    expect(aggregateLots([second, first]).quantity).toBe('0.000000');
    expect(aggregateLots([first, second]).quantity).toBe('0.000000');
  });

  it('NO pierde precisión donde el cálculo en coma flotante la perdería', () => {
    // 0.1 + 0.2 en binario da 0.30000000000000004; aquí debe dar 0.3 exacto.
    const result = aggregateLots([
      lot({ quantity: '0.1', price: '1', tradedAt: '2026-01-01' }),
      lot({ quantity: '0.2', price: '1', tradedAt: '2026-01-02' }),
    ]);

    expect(result.quantity).toBe('0.300000');
    expect(result.avgPrice).toBe('1.000000');
  });

  it('mantiene el precio medio exacto en un caso que el flotante desplaza', () => {
    // 3 compras de 1 título a 0,1 / 0,2 / 0,3: coste 0,6 exacto y medio 0,2 exacto.
    const result = aggregateLots([
      lot({ quantity: '1', price: '0.1', tradedAt: '2026-01-01' }),
      lot({ quantity: '1', price: '0.2', tradedAt: '2026-01-02' }),
      lot({ quantity: '1', price: '0.3', tradedAt: '2026-01-03' }),
    ]);

    expect(result.cost).toBe('0.600000');
    expect(result.avgPrice).toBe('0.200000');
  });

  it('rechaza una venta que dejaría la posición en negativo (no hay cortos)', () => {
    expect(() =>
      aggregateLots([
        lot({ quantity: '5', price: '100', tradedAt: '2026-01-01' }),
        lot({ kind: 'sell', quantity: '6', price: '100', tradedAt: '2026-02-01' }),
      ]),
    ).toThrow(expect.objectContaining({ code: 'NEGATIVE_QUANTITY' }));
  });

  it('rechaza una CANTIDAD que no cabría en numeric(18,6)', () => {
    expect(() =>
      aggregateLots([
        lot({ quantity: '999999999999', price: '1', tradedAt: '2026-01-01' }),
        lot({ quantity: '999999999999', price: '1', tradedAt: '2026-01-02' }),
      ]),
    ).toThrow(expect.objectContaining({ code: 'OVERFLOW' }));
  });

  it('acepta un coste enorme mientras cantidad y precio medio quepan en su columna', () => {
    // El coste (10¹² · 10¹² = 10²⁴) no tiene columna: solo se guardan cantidad y medio.
    const result = aggregateLots([
      lot({ quantity: '999999999999', price: '999999999999', tradedAt: '2026-01-01' }),
    ]);

    expect(result.quantity).toBe('999999999999.000000');
    expect(result.avgPrice).toBe('999999999999.000000');
  });

  it('un precio de 0 (p. ej. una entrega gratuita) es válido y baja el medio', () => {
    const result = aggregateLots([
      lot({ quantity: '10', price: '100', tradedAt: '2026-01-01' }),
      lot({ quantity: '10', price: '0', tradedAt: '2026-01-02' }),
    ]);

    expect(result.avgPrice).toBe('50.000000');
  });
});
