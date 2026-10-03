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

  it('returns the body and does not retry what succeeded', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, '{"a":1}'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('https://x.test', { timeoutMs: 1000, retry: RETRY })).resolves.toEqual({
      ok: true,
      status: 200,
      body: { a: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 429/5xx according to the policy and gives up with the last status', async () => {
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

  it('does not retry a 4xx the policy does not cover', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('https://x.test', { timeoutMs: 1000, retry: RETRY })).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('with a policy, also retries network failures; without one, a single attempt', async () => {
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

  it('a non-JSON body is a failure without status, not an exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, 'not json')));

    const result = await fetchJson('https://x.test', { timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('status');
  });

  it('applies the timeout to each attempt', async () => {
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

  it('an exhausted external budget aborts the current attempt and does not retry', async () => {
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

  it('with the budget already exhausted it does not request anything', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson('https://x.test', { timeoutMs: 1000, signal: AbortSignal.abort() });

    expect(result).toEqual({ ok: false, error: 'time budget exhausted' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetchText returns the body as text and sends method, headers and body', async () => {
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
