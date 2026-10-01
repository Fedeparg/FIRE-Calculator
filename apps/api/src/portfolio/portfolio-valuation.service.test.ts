import { describe, expect, it, vi } from 'vitest';

import { PortfolioValuationService } from './portfolio-valuation.service.js';

/**
 * El reparto es `buildBreakdown` de `@sextante/core` (con sus propios tests); aquí solo se
 * prueba lo que añade el servicio: qué posiciones le pasa y con qué precios y tasas.
 */
function makeService() {
  const positions = [
    { id: 'p1', ticker: 'IWDA.AS', name: 'World', quantity: 10, avgPrice: 80, broker: 'TR', currency: 'EUR', isDerivative: false },
    { id: 'p2', ticker: 'AAPL', name: 'Apple', quantity: 1, avgPrice: 150, broker: null, currency: 'USD', isDerivative: false },
    { id: 'p3', ticker: 'DE000KO1', name: 'Knock-out', quantity: 100, avgPrice: 1, broker: 'TR', currency: 'EUR', isDerivative: true },
  ];
  const prices = new Map([
    ['IWDA.AS', { close: 100, currency: 'EUR', date: '2026-10-01' }],
    ['AAPL', { close: 220, currency: 'USD', date: '2026-10-01' }],
    // Aunque un derivado tuviera precio, no se usa.
    ['DE000KO1', { close: 50, currency: 'EUR', date: '2026-10-01' }],
  ]);
  return new PortfolioValuationService(
    { findAllByUser: vi.fn().mockResolvedValue(positions) } as never,
    {
      getPrices: vi.fn().mockResolvedValue(prices),
      getFxRates: vi.fn().mockResolvedValue({ rates: { USD: 1, EUR: 1.1 }, asOf: '2026-10-01' }),
    } as never,
  );
}

describe('PortfolioValuationService.breakdown', () => {
  it('reparte por bróker en la divisa pedida y deja fuera los derivados', async () => {
    const result = await makeService().breakdown('user-1', 'EUR', 'broker');

    // TR: 10 × 100 € = 1.000 €. Sin bróker: 220 $ / 1,1 = 200 €. El knock-out no cuenta.
    expect(result.total).toBeCloseTo(1200, 6);
    expect(result.included).toBe(2);
    expect(result.excluded).toBe(0);
    expect(result.slices.map((s) => [s.label, Math.round(s.value)])).toEqual([
      ['TR', 1000],
      ['Sin bróker', 200],
    ]);
    expect(result).toMatchObject({ display: 'EUR', fxAsOf: '2026-10-01' });
  });

  it('marca los derivados en la valoración por posición y no los suma al total', async () => {
    const valuation = await makeService().valuate('user-1', 'EUR');

    expect(valuation.positions.find((p) => p.id === 'p3')?.isDerivative).toBe(true);
    expect(valuation.aggregate.total).toBe(2);
  });
});
