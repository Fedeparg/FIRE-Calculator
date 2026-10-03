import { errorMessage } from './errors.js';

/** Waits for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries with linear backoff (`baseMs × attempt`), like the ones the Yahoo client already used. */
export interface RetryPolicy {
  /** Total attempts, including the first one. */
  max: number;
  baseMs: number;
  /** Should this HTTP response be retried? (e.g. 429 and 5xx). */
  retryOn: (status: number) => boolean;
}

export interface RequestOptions {
  /** Time limit of each attempt, body included. */
  timeoutMs: number;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /**
   * Without a policy, a single attempt. With one, network failures, timeouts and an unreadable
   * body are retried too.
   */
  retry?: RetryPolicy;
  /**
   * External time budget (e.g. that of a whole batch, `AbortSignal.timeout`): once it runs out, the
   * current attempt is aborted and nothing more is retried.
   */
  signal?: AbortSignal;
}

/**
 * Result of a request to an external service. `ok: false` carries the `status` if there was an
 * HTTP response (non-2xx) and a text for the log; without `status`, the network, the timeout or the
 * body failed. Never throws: each provider decides how to degrade.
 */
export type HttpResult<T> = { ok: true; status: number; body: T } | { ok: false; status?: number; error: string };

async function request<T>(
  url: string,
  options: RequestOptions,
  read: (response: Response) => Promise<T>,
): Promise<HttpResult<T>> {
  const attempts = options.retry?.max ?? 1;
  let last: HttpResult<T> = { ok: false, error: 'no attempts' };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1 && options.retry) await sleep(options.retry.baseMs * (attempt - 1));
    if (options.signal?.aborted) {
      return { ok: false, error: 'time budget exhausted' };
    }
    const timeout = AbortSignal.timeout(options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
      });
      if (!response.ok) {
        last = { ok: false, status: response.status, error: `HTTP ${response.status}` };
        if (options.retry?.retryOn(response.status)) continue;
        return last;
      }
      return { ok: true, status: response.status, body: await read(response) };
    } catch (error) {
      last = { ok: false, error: errorMessage(error) };
      if (options.signal?.aborted) return last;
    }
  }
  return last;
}

/** Request with a timeout (and optional retries) whose body is untyped JSON. */
export function fetchJson(url: string, options: RequestOptions): Promise<HttpResult<unknown>> {
  return request<unknown>(url, options, (response) => response.json());
}

/** Same as `fetchJson`, with the body as text (e.g. the ECB CSV). */
export function fetchText(url: string, options: RequestOptions): Promise<HttpResult<string>> {
  return request(url, options, (response) => response.text());
}
