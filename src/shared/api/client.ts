/**
 * Frontend HTTP client for the API (same-origin, via the Next BFF).
 *
 * Centralizes what every component used to reimplement: throwing a typed error when the
 * response is not 2xx, telling network failures from server failures, and translating both
 * into a common i18n key. The API always decides authorization; this only transports and
 * classifies.
 */

/** Common i18n keys that every UI namespace defines under the same name. */
export type ApiErrorKey = "errorSession" | "errorNetwork" | "errorServer" | "errorInvalid" | "errorGeneric";

export type ApiErrorOptions = ErrorOptions & { body?: unknown };

/** Error from an API call. `status` is 0 when there was no response at all (network). */
export class ApiError extends Error {
  readonly status: number;
  /** Domain code the API returns in the body of 4xx responses (`{ code }`), if any. */
  readonly code?: string;
  /** The error's JSON body as received (unvalidated), e.g. `{ code, existing }` of a 409. */
  readonly body?: unknown;

  constructor(status: number, code?: string, options?: ApiErrorOptions) {
    super(status === 0 ? "Network error" : `API error ${status}${code ? ` (${code})` : ""}`, options);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = options?.body;
  }

  /** `true` if the browser could not complete the request (offline, DNS, CORS…). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

/** An abort (`AbortController`) is not a failure: it propagates as is so the caller can ignore it. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Reads an API error body without trusting its shape: the `code` (if any) and the raw JSON. */
async function readErrorBody(res: Response): Promise<{ code?: string; body?: unknown }> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "code" in body && typeof body.code === "string") {
      return { code: body.code, body };
    }
    return { body };
  } catch {
    return {}; // empty or non-JSON body: no code
  }
}

/** Bodies sent as is (e.g. a CSV): the caller sets its `Content-Type`. */
function isRawBody(body: unknown): body is Blob | string {
  return typeof body === "string" || body instanceof Blob;
}

/**
 * Call options: like `RequestInit`, but `body` is a JSON value (serialized here) or, if it is a
 * `Blob`/`string`, sent untouched.
 */
export type ApiJsonInit = Omit<RequestInit, "body"> & { body?: unknown };

/** `fetch` options for reads that must not be served from cache (a constant: stable across renders). */
export const NO_STORE = { cache: "no-store" } as const;

/**
 * Same-origin `fetch` that throws `ApiError` if the response is not 2xx or on a network failure.
 * With a JSON `body`, it serializes it and adds `Content-Type: application/json`. Returns the
 * `Response` for cases where the body does not matter (actions that only acknowledge) or is not
 * JSON (blob downloads).
 */
export async function apiFetch(path: string, init?: ApiJsonInit): Promise<Response> {
  const { body, headers, ...rest } = init ?? {};
  const hasJsonBody = body !== undefined && !isRawBody(body);
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: hasJsonBody ? { "Content-Type": "application/json", ...headers } : headers,
      body: hasJsonBody ? JSON.stringify(body) : isRawBody(body) ? body : undefined,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    // The fetch promise only rejects on a network/connection failure.
    throw new ApiError(0, undefined, { cause: error });
  }
  if (!res.ok) {
    const { code, body: errorBody } = await readErrorBody(res);
    throw new ApiError(res.status, code, { body: errorBody });
  }
  return res;
}

/**
 * Calls the API and parses the JSON. A no-content response (204) returns `undefined`: use
 * `apiJson<void>` in those cases.
 */
export async function apiJson<T>(path: string, init?: ApiJsonInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch (error) {
    // 2xx with a non-JSON body: the API broke the contract; treated as a server failure.
    throw new ApiError(500, undefined, { cause: error });
  }
}

/**
 * Common i18n key for a failure. Each component uses it as is or, before calling it, resolves
 * its own `code`s (`error.code === "DUPLICATE"`…) and delegates the rest here.
 */
export function apiErrorKey(error: unknown): ApiErrorKey {
  if (!(error instanceof ApiError)) return "errorGeneric";
  if (error.isNetwork) return "errorNetwork";
  if (error.status === 401) return "errorSession";
  if (error.status >= 500) return "errorServer";
  if (error.status === 400 || error.status === 422) return "errorInvalid";
  return "errorGeneric";
}

/** Common key a mapper may return besides its own: all but `errorInvalid`, which is replaced by `invalidFallback`. */
type CommonErrorKey = Exclude<ApiErrorKey, "errorInvalid">;

/** Configuration for `createApiErrorMapper`. */
export type ApiErrorMapperConfig<K extends string, F extends string> = {
  /** Domain codes (the body's `{ code }`) with their own message. They take precedence over the status. */
  codes?: Readonly<Record<string, K>>;
  /** HTTP statuses with their own message (e.g. 404, 413, 429), when there is no known code. */
  statuses?: Readonly<Partial<Record<number, K>>>;
  /**
   * Key for a 400/422 without its own code. `"errorInvalid"` ("check the data") where there is a
   * form; `"errorGeneric"` where there is none (a file, a button) and that message would confuse.
   */
  invalidFallback: F;
};

/**
 * Creates a namespace's `error → i18n key` function. Replaces the `xxxErrorKey` helpers each
 * feature hand-wrote with the same rule order: first the domain code, then the feature's own
 * status, and finally the common `apiErrorKey` mapping (network, session, server…). Only the
 * `code` is used, never the server's `message`: it is in Spanish and would break English.
 */
export function createApiErrorMapper<K extends string, F extends string>({
  codes,
  statuses,
  invalidFallback,
}: ApiErrorMapperConfig<K, F>): (error: unknown) => K | F | CommonErrorKey {
  return (error) => {
    if (error instanceof ApiError) {
      // `hasOwn`: a `code` such as "toString" must not hit the object's prototype.
      const byCode =
        codes && error.code !== undefined && Object.hasOwn(codes, error.code) ? codes[error.code] : undefined;
      if (byCode !== undefined) return byCode;
      const byStatus = statuses?.[error.status];
      if (byStatus !== undefined) return byStatus;
    }
    const common = apiErrorKey(error);
    return common === "errorInvalid" ? invalidFallback : common;
  };
}
