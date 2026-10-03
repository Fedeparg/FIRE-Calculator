import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchJson, fetchText, type RetryPolicy } from './http.js';

const RETRY: RetryPolicy = { max: 3, baseMs: 0, retryOn: (status) => status === 429 || status >= 500 };

function respond(status: number, body = '{}'): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
}

describe('fetchJson / fetchText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve el cuerpo y no reintenta lo que ha ido bien', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, '{"a":1}'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('https://x.test', { timeoutMs: 1000, retry: RETRY })).resolves.toEqual({
      ok: true,
      status: 200,
      body: { a: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reintenta 429/5xx según la política y se rinde con el último status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(503)).mockResolvedValueOnce(respond(200, '[1]'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://x.test', { timeoutMs: 1000, retry: RETRY })).resolves.toMatchObject({
      ok: true,
      body: [1],
    });

    const always429 = vi.fn().mockImplementation(() => Promise.resolve(respond(429)));
    vi.stubGlobal('fetch', always429);
    await expect(fetchJson('https://x.test', { timeoutMs: 1000, retry: RETRY })).resolves.toEqual({
      ok: false,
      status: 429,
      error: 'HTTP 429',
    });
    expect(always429).toHaveBeenCalledTimes(3);
  });

  it('no reintenta un 4xx que la política no contempla', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('https://x.test', { timeoutMs: 1000, retry: RETRY })).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('con política, reintenta también los fallos de red; sin ella, un solo intento', async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(respond(200));
    vi.stubGlobal('fetch', flaky);
    await expect(fetchJson('https://x.test', { timeoutMs: 1000, retry: RETRY })).resolves.toMatchObject({ ok: true });

    const broken = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', broken);
    await expect(fetchJson('https://x.test', { timeoutMs: 1000 })).resolves.toEqual({
      ok: false,
      error: 'fetch failed',
    });
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it('un cuerpo que no es JSON es un fallo sin status, no una excepción', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, 'no es json')));

    const result = await fetchJson('https://x.test', { timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('status');
  });

  it('aplica el timeout a cada intento', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
        });
      }),
    );

    const result = await fetchText('https://x.test', { timeoutMs: 10 });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? '' : result.error).toMatch(/timeout|aborted/i);
  });

  it('un presupuesto externo agotado aborta el intento en curso y no reintenta', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson('https://x.test', {
      timeoutMs: 60_000,
      retry: RETRY,
      signal: AbortSignal.timeout(10),
    });

    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('con el presupuesto ya agotado no llega a pedir nada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson('https://x.test', { timeoutMs: 1000, signal: AbortSignal.abort() });

    expect(result).toEqual({ ok: false, error: 'presupuesto de tiempo agotado' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetchText devuelve el cuerpo como texto y envía método, cabeceras y cuerpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('a,b\n1,2', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchText('https://x.test', { timeoutMs: 1000, method: 'POST', headers: { 'X-Key': 'k' }, body: '[]' }),
    ).resolves.toEqual({ ok: true, status: 200, body: 'a,b\n1,2' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.test',
      expect.objectContaining({ method: 'POST', headers: { 'X-Key': 'k' }, body: '[]' }),
    );
  });
});
