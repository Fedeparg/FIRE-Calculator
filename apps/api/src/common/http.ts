import { errorMessage } from './errors.js';

/** Pausa de `ms` milisegundos. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reintentos con espera lineal (`baseMs × intento`), como los que ya usaba el cliente de Yahoo. */
export interface RetryPolicy {
  /** Intentos en total, el primero incluido. */
  max: number;
  baseMs: number;
  /** ¿Se reintenta esta respuesta HTTP? (p. ej. 429 y 5xx). */
  retryOn: (status: number) => boolean;
}

export interface RequestOptions {
  /** Tope de cada intento, cuerpo incluido. */
  timeoutMs: number;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /**
   * Sin política, un solo intento. Con política, también se reintentan los fallos de red, los
   * timeouts y un cuerpo ilegible.
   */
  retry?: RetryPolicy;
  /**
   * Presupuesto externo (p. ej. el de un lote entero, `AbortSignal.timeout`): si se agota, el
   * intento en curso se aborta y no se reintenta más.
   */
  signal?: AbortSignal;
}

/**
 * Resultado de una petición a un servicio externo. `ok: false` lleva el `status` si hubo
 * respuesta HTTP (no 2xx) y un texto para el log; sin `status`, falló la red, el timeout o el
 * cuerpo. Nunca lanza: cada proveedor decide cómo degradar.
 */
export type HttpResult<T> = { ok: true; status: number; body: T } | { ok: false; status?: number; error: string };

async function request<T>(
  url: string,
  options: RequestOptions,
  read: (response: Response) => Promise<T>,
): Promise<HttpResult<T>> {
  const attempts = options.retry?.max ?? 1;
  let last: HttpResult<T> = { ok: false, error: 'sin intentos' };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1 && options.retry) await sleep(options.retry.baseMs * (attempt - 1));
    if (options.signal?.aborted) {
      return { ok: false, error: 'presupuesto de tiempo agotado' };
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

/** Petición con timeout (y reintentos opcionales) cuyo cuerpo es JSON, sin tipar. */
export function fetchJson(url: string, options: RequestOptions): Promise<HttpResult<unknown>> {
  return request<unknown>(url, options, (response) => response.json());
}

/** Igual que `fetchJson`, con el cuerpo como texto (p. ej. el CSV del BCE). */
export function fetchText(url: string, options: RequestOptions): Promise<HttpResult<string>> {
  return request(url, options, (response) => response.text());
}
