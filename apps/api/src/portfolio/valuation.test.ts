import { describe, expect, it } from 'vitest';

import { aggregatePortfolio, convertCurrency } from './valuation';

describe('convertCurrency', () => {
  // rates = USD por unidad de divisa (USD = 1).
  const rates = { USD: 1, EUR: 1.1, GBP: 1.25 };

  it('devuelve el mismo importe si origen y destino coinciden', () => {
    expect(convertCurrency(100, 'EUR', 'EUR', rates)).toBe(100);
  });

  it('convierte EUR→USD usando la tasa de origen', () => {
    expect(convertCurrency(100, 'EUR', 'USD', rates)).toBeCloseTo(110, 6);
  });

  it('convierte USD→EUR como inverso de EUR→USD', () => {
    expect(convertCurrency(110, 'USD', 'EUR', rates)).toBeCloseTo(100, 6);
  });

  it('convierte entre dos divisas no USD (EUR→GBP)', () => {
    expect(convertCurrency(100, 'EUR', 'GBP', rates)).toBeCloseTo((100 * 1.1) / 1.25, 6);
  });

  it('devuelve null si falta la tasa de origen o destino', () => {
    expect(convertCurrency(100, 'JPY', 'EUR', rates)).toBeNull();
    expect(convertCurrency(100, 'EUR', 'JPY', rates)).toBeNull();
  });

  it('devuelve null ante una tasa cero o no finita (no inventa números)', () => {
    expect(convertCurrency(100, 'EUR', 'USD', { ...rates, EUR: 0 })).toBeNull();
    expect(convertCurrency(100, 'EUR', 'USD', { ...rates, USD: Number.NaN })).toBeNull();
  });
});

describe('aggregatePortfolio', () => {
  const rates = { USD: 1, EUR: 1.1 };

  it('agrega coste y valor convertidos, con P&L = valor − invertido', () => {
    const result = aggregatePortfolio({
      display: 'EUR',
      positions: [{ ticker: 'ACME', quantity: 10, avgPrice: 100, currency: 'EUR' }],
      prices: { ACME: { close: 120, currency: 'EUR' } },
      rates,
    });

    expect(result.invested).toBeCloseTo(1000, 6);
    expect(result.marketValue).toBeCloseTo(1200, 6);
    expect(result.pnlAbs).toBeCloseTo(200, 6);
    expect(result.pnlPct).toBeCloseTo(20, 6);
    expect(result.valued).toBe(1);
    expect(result.total).toBe(1);
  });

  it('convierte coste y valor desde divisas distintas (compra EUR, cotiza USD)', () => {
    // Coste en EUR, precio en USD: cada uno se convierte a display desde SU divisa.
    const result = aggregatePortfolio({
      display: 'EUR',
      positions: [{ ticker: 'WLD', quantity: 1, avgPrice: 100, currency: 'EUR' }],
      prices: { WLD: { close: 110, currency: 'USD' } },
      rates,
    });

    expect(result.invested).toBeCloseTo(100, 6); // ya en EUR
    expect(result.marketValue).toBeCloseTo(110 / 1.1, 6); // 110 USD → EUR
    expect(result.valued).toBe(1);
  });

  it('excluye del total las posiciones sin precio o sin tasa convertible', () => {
    const result = aggregatePortfolio({
      display: 'EUR',
      positions: [
        { ticker: 'A', quantity: 1, avgPrice: 100, currency: 'EUR' }, // ok
        { ticker: 'B', quantity: 1, avgPrice: 100, currency: 'EUR' }, // sin precio
        { ticker: 'C', quantity: 1, avgPrice: 100, currency: 'JPY' }, // sin tasa
      ],
      prices: { A: { close: 100, currency: 'EUR' }, C: { close: 100, currency: 'JPY' } },
      rates,
    });

    expect(result.valued).toBe(1);
    expect(result.total).toBe(3);
  });

  it('deja pnlPct en null cuando el invertido es 0', () => {
    const result = aggregatePortfolio({
      display: 'EUR',
      positions: [{ ticker: 'A', quantity: 0, avgPrice: 0, currency: 'EUR' }],
      prices: { A: { close: 100, currency: 'EUR' } },
      rates,
    });

    expect(result.invested).toBe(0);
    expect(result.pnlPct).toBeNull();
  });
});
