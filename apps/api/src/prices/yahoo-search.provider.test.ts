import { afterEach, describe, expect, it, vi } from 'vitest';

import { YahooInstrumentSearchProvider } from './yahoo-search.provider.js';

const BODY = { quotes: [{ symbol: 'AAPL', longname: 'Apple Inc.', quoteType: 'EQUITY', exchDisp: 'NASDAQ' }] };

describe('YahooInstrumentSearchProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cachea una consulta repetida: la segunda no sale a Yahoo', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(BODY)));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new YahooInstrumentSearchProvider();

    const first = await provider.search('apple');
    const second = await provider.search(' apple ');

    expect(first).toEqual([{ symbol: 'AAPL', name: 'Apple Inc.', type: 'equity', exchange: 'NASDAQ' }]);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no cachea un fallo de Yahoo: el siguiente intento vuelve a preguntar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json(BODY));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new YahooInstrumentSearchProvider();

    await expect(provider.search('apple')).resolves.toEqual([]);
    await expect(provider.search('apple')).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no pregunta por consultas más cortas que el mínimo', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new YahooInstrumentSearchProvider().search('a')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
