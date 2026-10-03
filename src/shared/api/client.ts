/**
 * Cliente HTTP del frontend contra la API (same-origin, vía el BFF de Next).
 *
 * Centraliza lo que antes cada componente reimplementaba: lanzar un error tipado cuando la
 * respuesta no es 2xx, distinguir el fallo de red del de servidor y traducir ambos a una clave
 * i18n común. La autorización la decide siempre la API; aquí solo se transporta y se clasifica.
 */

/** Claves i18n comunes que cada namespace de UI define con ese mismo nombre. */
export type ApiErrorKey = "errorSession" | "errorNetwork" | "errorServer" | "errorInvalid" | "errorGeneric";

export type ApiErrorOptions = ErrorOptions & { body?: unknown };

/** Error de una llamada a la API. `status` es 0 cuando ni siquiera hubo respuesta (red). */
export class ApiError extends Error {
  readonly status: number;
  /** Código de dominio que la API devuelve en el cuerpo de los 4xx (`{ code }`), si existe. */
  readonly code?: string;
  /** Cuerpo JSON del error tal cual llegó (sin validar), p. ej. `{ code, existing }` de un 409. */
  readonly body?: unknown;

  constructor(status: number, code?: string, options?: ApiErrorOptions) {
    super(status === 0 ? "Network error" : `API error ${status}${code ? ` (${code})` : ""}`, options);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = options?.body;
  }

  /** `true` si el navegador no pudo completar la petición (sin conexión, DNS, CORS…). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

/** Una cancelación (`AbortController`) no es un fallo: se propaga tal cual para que el llamador la ignore. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Lee el cuerpo de un error de la API sin fiarse de su forma: el `code` (si lo hay) y el JSON crudo. */
async function readErrorBody(res: Response): Promise<{ code?: string; body?: unknown }> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "code" in body && typeof body.code === "string") {
      return { code: body.code, body };
    }
    return { body };
  } catch {
    return {}; // cuerpo vacío o no JSON: no hay código
  }
}

/** Cuerpos que viajan tal cual (p. ej. un CSV): el llamador pone su `Content-Type`. */
function isRawBody(body: unknown): body is Blob | string {
  return typeof body === "string" || body instanceof Blob;
}

/**
 * Opciones de las llamadas: como `RequestInit`, pero `body` es un valor JSON (se serializa
 * aquí) o, si es un `Blob`/`string`, se envía sin tocar.
 */
export type ApiJsonInit = Omit<RequestInit, "body"> & { body?: unknown };

/** Opciones de `fetch` para lecturas que no deben servirse de caché (constante: estable entre renders). */
export const NO_STORE = { cache: "no-store" } as const;

/**
 * `fetch` same-origin que lanza `ApiError` si la respuesta no es 2xx o si hay fallo de red.
 * Si hay `body` JSON, lo serializa y añade `Content-Type: application/json`. Devuelve la `Response`
 * para los casos en que no interesa el cuerpo (acciones que solo confirman) o no es JSON
 * (descargas en blob).
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
    // La promesa de fetch solo rechaza por fallo de red/conexión.
    throw new ApiError(0, undefined, { cause: error });
  }
  if (!res.ok) {
    const { code, body: errorBody } = await readErrorBody(res);
    throw new ApiError(res.status, code, { body: errorBody });
  }
  return res;
}

/**
 * Llama a la API y parsea el JSON. Una respuesta sin contenido (204) devuelve `undefined`:
 * usa `apiJson<void>` en esos casos.
 */
export async function apiJson<T>(path: string, init?: ApiJsonInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch (error) {
    // 2xx con cuerpo no JSON: la API rompió el contrato; se trata como fallo del servidor.
    throw new ApiError(500, undefined, { cause: error });
  }
}

/**
 * Clave i18n común para un fallo. Cada componente la usa tal cual o, antes de llamarla,
 * resuelve sus `code` propios (`error.code === "DUPLICATE"`…) y delega aquí el resto.
 */
export function apiErrorKey(error: unknown): ApiErrorKey {
  if (!(error instanceof ApiError)) return "errorGeneric";
  if (error.isNetwork) return "errorNetwork";
  if (error.status === 401) return "errorSession";
  if (error.status >= 500) return "errorServer";
  if (error.status === 400 || error.status === 422) return "errorInvalid";
  return "errorGeneric";
}

/** Clave común que un mapeador puede devolver además de las suyas: todas menos `errorInvalid`, que se sustituye por `invalidFallback`. */
type CommonErrorKey = Exclude<ApiErrorKey, "errorInvalid">;

/** Configuración de `createApiErrorMapper`. */
export type ApiErrorMapperConfig<K extends string, F extends string> = {
  /** Códigos de dominio (`{ code }` del cuerpo) con mensaje propio. Mandan sobre el status. */
  codes?: Readonly<Record<string, K>>;
  /** Status HTTP con mensaje propio (p. ej. 404, 413, 429), cuando no hay código conocido. */
  statuses?: Readonly<Partial<Record<number, K>>>;
  /**
   * Clave para un 400/422 sin código propio. `"errorInvalid"` ("revisa los datos") donde hay un
   * formulario; `"errorGeneric"` donde no lo hay (un fichero, un botón) y ese mensaje confundiría.
   */
  invalidFallback: F;
};

/**
 * Crea la función `error → clave i18n` de un namespace. Sustituye a las `xxxErrorKey` que cada
 * feature escribía a mano con el mismo orden de reglas: primero el código de dominio, luego el
 * status propio y, al final, el mapeo común de `apiErrorKey` (red, sesión, servidor…). Solo
 * viaja el `code`, nunca el `message` del servidor: está en castellano y rompería el inglés.
 */
export function createApiErrorMapper<K extends string, F extends string>({
  codes,
  statuses,
  invalidFallback,
}: ApiErrorMapperConfig<K, F>): (error: unknown) => K | F | CommonErrorKey {
  return (error) => {
    if (error instanceof ApiError) {
      // `hasOwn`: un `code` como "toString" no debe encontrar el prototipo del objeto.
      if (codes && error.code !== undefined && Object.hasOwn(codes, error.code)) return codes[error.code];
      const byStatus = statuses?.[error.status];
      if (byStatus !== undefined) return byStatus;
    }
    const common = apiErrorKey(error);
    return common === "errorInvalid" ? invalidFallback : common;
  };
}
