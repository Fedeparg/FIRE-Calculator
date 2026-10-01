// Frescura de los precios de la cartera: decide qué filas se valoran con un precio anterior
// al del último refresco. Core puro (sin React), testeable.
//
// POR QUÉ EL MÁXIMO Y NO UNA MARCA DEL SERVIDOR: `GET /api/prices` da una fecha POR símbolo
// y no hay ninguna "fecha del último refresco" global (la única global es `asOf` de las tasas
// FX, que es otra cosa). La fecha más reciente entre los precios recibidos es, por tanto, la
// mejor referencia disponible de cuándo se actualizó la cartera por última vez.
//
// Consecuencia asumida: si TODOS los precios son igual de viejos (mercado cerrado, o un
// refresco que falló entero), no se marca ninguna fila. Es honesto: sin una referencia
// externa no hay forma de saber que ese día no era el bueno, y marcarlo todo no informaría
// de nada. Lo que sí detecta —y es el caso real— es la fila que se queda atrás respecto a
// las demás: un fondo con valor liquidativo diferido junto a acciones cotizadas al día.

/** Fecha "a secas" tal y como la sirve la API: `YYYY-MM-DD`, sin hora ni zona. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Lo mínimo que se necesita de un precio: su fecha. No se acopla a `PriceInfo`. */
export interface DatedPrice {
  date: string;
}

/**
 * Fecha del precio más reciente entre los recibidos, o `null` si no hay ninguna utilizable.
 *
 * Las fechas ISO de longitud fija se comparan como texto (orden lexicográfico = orden
 * cronológico), así que no hace falta construir ningún `Date` ni preocuparse por la zona
 * horaria. Las que no tengan ese formato se ignoran en lugar de contaminar el máximo.
 */
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
 * `true` si este precio es anterior al último refresco, es decir, si la fila se está
 * valorando con un dato más viejo que el resto de la cartera.
 *
 * Sin precio, sin referencia o con una fecha ilegible se devuelve `false`: la ausencia de
 * precio ya se comunica con "—" y su propia explicación, y una fecha que no se entiende no
 * es motivo para acusar al dato de viejo.
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
 * Instante (ISO) de la lectura más reciente entre los precios recibidos, o `null` si ninguno
 * lo trae legible. Es lo que la cartera enseña como "precios actualizados hace…": con el
 * refresco intradía, la fecha del precio (`date`) no cambia en todo el día, pero este sí.
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
 * Ventana en la que una posición sin precio se considera "buscando precio" y no "sin precio".
 * Resolver un ISIN a una cotización (búsqueda en Yahoo con pausas + OpenFIGI) tarda de
 * segundos a un par de minutos; 10 minutos deja margen de sobra sin dejar un spinner eterno
 * para un símbolo que de verdad no cotiza.
 */
export const PENDING_PRICE_WINDOW_MS = 10 * 60_000;

/** Lo mínimo de una posición para decidir si su precio está en camino. */
export interface PendingPricePosition {
  isDerivative: boolean;
  /** Instante ISO de alta de la posición. */
  createdAt: string;
}

/**
 * `true` si la posición aún no tiene precio PERO es lo bastante reciente como para que el
 * servidor siga buscándolo en segundo plano (el alta lo lanza sin esperar).
 *
 * POR QUÉ LA EDAD Y NO UN CAMPO DEL SERVIDOR: la API no distingue "pendiente" de "no existe";
 * la antigüedad de la posición es la señal más simple y robusta, y no requiere estado nuevo.
 * Un `createdAt` ilegible nunca es pendiente; una edad negativa (reloj del navegador
 * desajustado) cuenta como recién creada.
 *
 * Los derivados nunca se valoran, así que nunca están pendientes.
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
