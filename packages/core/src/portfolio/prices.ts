// Frescura de los precios de la cartera: qué filas se valoran con un precio anterior al último refresco.
//
// Se usa el máximo de las fechas recibidas porque `GET /api/prices` da una fecha por símbolo y no
// hay marca global de refresco. Si todos los precios son igual de viejos no se marca ninguna fila:
// sin referencia externa no se puede saber que ese día no era el bueno.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DatedPrice {
  date: string;
}

/** Fecha del precio más reciente (ISO, comparada como texto), o `null`; ignora formatos ilegibles. */
export function latestPriceDate(prices: Record<string, DatedPrice | undefined>): string | null {
  let latest: string | null = null;
  for (const price of Object.values(prices)) {
    const date = price?.date;
    if (!date || !ISO_DATE.test(date)) continue;
    if (latest === null || date > latest) latest = date;
  }
  return latest;
}

/**
 * `true` si el precio es anterior al último refresco. Sin precio, sin referencia o con fecha
 * ilegible devuelve `false`: la ausencia de precio ya se muestra como "—".
 */
export function isStalePrice(price: DatedPrice | undefined, latest: string | null): boolean {
  if (!price || !latest) return false;
  if (!ISO_DATE.test(price.date)) return false;
  return price.date < latest;
}

/** Lo mínimo para saber cuándo se leyó un precio: el instante ISO en que se obtuvo. */
export interface FetchedPrice {
  fetchedAt?: string;
}

/**
 * Instante ISO de la lectura más reciente. Con refresco intradía `date` no cambia en todo el día,
 * pero este sí.
 */
export function latestFetchedAt(prices: Record<string, FetchedPrice | undefined>): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const price of Object.values(prices)) {
    const iso = price?.fetchedAt;
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms) || ms <= latestMs) continue;
    latest = iso;
    latestMs = ms;
  }
  return latest;
}

/**
 * Ventana en la que una posición sin precio es "buscando precio". Resolver un ISIN (Yahoo + OpenFIGI)
 * tarda de segundos a un par de minutos; 10 evita un spinner eterno.
 */
export const PENDING_PRICE_WINDOW_MS = 10 * 60_000;

export interface PendingPricePosition {
  isDerivative: boolean;
  createdAt: string;
}

/**
 * `true` si aún no hay precio pero la posición es reciente y el servidor lo busca en segundo plano.
 * Se usa la edad porque la API no distingue "pendiente" de "no existe". Un `createdAt` ilegible no
 * es pendiente; una edad negativa (reloj desajustado) cuenta como recién creada. Los derivados nunca.
 */
export function isPricePending(
  position: PendingPricePosition,
  price: unknown,
  nowMs: number,
  windowMs: number = PENDING_PRICE_WINDOW_MS,
): boolean {
  if (position.isDerivative || price !== undefined) return false;
  const createdMs = Date.parse(position.createdAt);
  if (Number.isNaN(createdMs)) return false;
  return nowMs - createdMs < windowMs;
}
