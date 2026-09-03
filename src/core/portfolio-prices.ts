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
