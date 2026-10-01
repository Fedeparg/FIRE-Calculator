// Agregación de lotes → (cantidad, precio medio) de una posición. Lógica PURA (sin Nest ni
// BD), testeable, y el único sitio donde se decide la semántica del coste medio.
//
// ⚠️ PRECISIÓN: aquí NO se pasa por `number` en ningún momento. Los `numeric` de Postgres
// llegan como `string` y se operan como enteros de coma fija (`bigint`), igual que haría un
// motor de base de datos. El código anterior de `combine` hacía la media ponderada con
// `Number()`, lo que introduce el error binario clásico (0.1 + 0.2 ≠ 0.3) y, acumulado sobre
// decenas de operaciones, desplaza el precio medio en céntimos. Ese error NO se propaga a los
// lotes.

import type { PositionLotKind } from '../db/schema.js';

/** Escala (decimales) de `position_lots.quantity/price` y de `positions.quantity/avg_price`. */
export const AMOUNT_SCALE = 6;

/**
 * Escala interna del coste acumulado. Un coste es `cantidad · precio`, es decir el producto
 * de dos números de escala 6, luego 12 decimales lo representan EXACTAMENTE: mientras solo
 * haya compras, el acumulado no pierde ni un dígito.
 *
 * LÍMITE DE PRECISIÓN DOCUMENTADO: la única operación que redondea es la VENTA, que retira
 * coste al coste medio vigente (`coste' = coste · (cantidad − vendida) / cantidad`); ese
 * cociente se redondea a 12 decimales con redondeo half-up. El error máximo por venta es de
 * 5·10⁻¹³ unidades monetarias, seis órdenes de magnitud por debajo de la escala en la que se
 * guarda el resultado (6 decimales), así que es irrelevante incluso tras miles de ventas.
 */
export const COST_SCALE = 12;

/** Un lote tal y como lo necesita la agregación (subconjunto de `PositionLot`). */
export interface AggregatableLot {
  id: string;
  kind: PositionLotKind;
  /** Cantidad de la operación, decimal en `string` (tal y como lo devuelve Drizzle). */
  quantity: string;
  /** Precio unitario de la operación, decimal en `string`. */
  price: string;
  /** Fecha de la operación (YYYY-MM-DD). */
  tradedAt: string;
  /** Instante de alta de la fila; desempata los lotes del MISMO día. */
  createdAt: Date;
}

/** Resultado de agregar: los dos campos que `positions` mantiene sincronizados. */
export interface LotAggregate {
  /** Cantidad viva = compras − ventas, como decimal en `string` con 6 decimales. */
  quantity: string;
  /** Precio medio de coste de las participaciones vivas, decimal en `string` con 6 decimales. */
  avgPrice: string;
  /**
   * Coste total vivo (cantidad · precio medio), decimal en `string` con 6 decimales. Es
   * INFORMATIVO (no tiene columna propia): la base de la futura fiscalidad de plusvalías.
   */
  cost: string;
}

/** Códigos de error de la agregación (el servicio los traduce a 400). */
export type LotAggregateErrorCode = 'NEGATIVE_QUANTITY' | 'OVERFLOW' | 'INVALID_DECIMAL';

/** Error de agregación con código, para que la capa HTTP dé un mensaje concreto. */
export class LotAggregateError extends Error {
  constructor(
    readonly code: LotAggregateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LotAggregateError';
  }
}

/**
 * Tope de `numeric(18,6)`: 12 dígitos enteros. Se comprueba aquí para que una secuencia de
 * lotes que desbordaría la columna dé un 400 con mensaje claro en vez de un 500 del driver.
 */
const MAX_AMOUNT_UNITS = 10n ** 12n;

const ONE_AMOUNT = 10n ** BigInt(AMOUNT_SCALE);

/**
 * Tolerancia de redondeo de una venta: 1 unidad a la escala de la columna (10⁻⁶). Las cantidades
 * se redondean a 6 decimales al guardarlas (el export de un bróker trae hasta 10), así que
 * vender "todo" puede exceder lo comprado por esa diferencia de redondeo. Un exceso dentro de
 * la tolerancia es ruido y deja la posición en exactamente 0; mayor, es una venta de más
 * (no admitimos cortos) y falla.
 */
const SELL_ROUNDING_TOLERANCE = 1n;

/** Solo decimales "planos" con signo opcional: nada de notación exponencial ni espacios. */
const PLAIN_DECIMAL = /^[+-]?(\d+)(?:\.(\d+))?$/;

/**
 * Convierte un decimal en `string` a entero de coma fija con `scale` decimales. Redondea
 * half-up si la cadena trae más decimales de los que caben (no debería, pero un `numeric`
 * de otra escala no debe corromper el cálculo en silencio).
 */
export function parseDecimal(value: string, scale: number): bigint {
  const match = PLAIN_DECIMAL.exec(value.trim());
  if (!match) {
    throw new LotAggregateError('INVALID_DECIMAL', `Valor decimal no válido: "${value}"`);
  }
  const negative = value.trim().startsWith('-');
  const [, intPart, fracPart = ''] = match;

  // Alarga con ceros o recorta (guardando el primer dígito sobrante para el redondeo).
  const padded = fracPart.padEnd(scale + 1, '0');
  const kept = padded.slice(0, scale);
  const nextDigit = padded.charCodeAt(scale) - 48;

  let units = BigInt(intPart + kept);
  if (nextDigit >= 5) units += 1n;
  return negative ? -units : units;
}

/** Formatea un entero de coma fija como decimal en `string` (inverso de `parseDecimal`). */
export function formatDecimal(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = scale > 0 ? `.${digits.slice(digits.length - scale)}` : '';
  return `${negative ? '-' : ''}${intPart}${fracPart}`;
}

/** División entera con redondeo half-up (`divisor` debe ser > 0). */
function divRoundHalfUp(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  if (absRemainder * 2n < divisor) return quotient;
  return dividend < 0n ? quotient - 1n : quotient + 1n;
}

/**
 * Orden canónico de los lotes: `(tradedAt, createdAt, id)`. `tradedAt` es un `date` sin hora,
 * así que dos operaciones del mismo día empatarían y el coste medio móvil dependería del
 * orden en que la BD devolviese las filas. Se desempata por instante de alta y, en última
 * instancia, por id: el resultado es determinista SIEMPRE.
 */
export function compareLots(a: AggregatableLot, b: AggregatableLot): number {
  if (a.tradedAt !== b.tradedAt) return a.tradedAt < b.tradedAt ? -1 : 1;
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Recorre los lotes en orden cronológico y devuelve la cantidad viva y el precio medio de
 * coste, que es lo que `positions.quantity` y `positions.avgPrice` deben reflejar.
 *
 * SEMÁNTICA: **coste medio móvil** (el estándar contable, y lo que ya hacía `combine`):
 *   - compra  → `cantidad += q`, `coste += q · p`
 *   - venta   → `cantidad −= q`, `coste −= q · precioMedioVigente` (el precio medio NO cambia)
 *
 * No es lo mismo que la media ponderada de TODAS las compras cuando hay ventas por medio.
 * Ejemplo: compra 10@100, venta 5, compra 5@200 → cantidad 10 y medio 150 (coste vivo
 * 500 + 1000), no 133,33 (que sería promediar las compras ignorando la venta).
 *
 * @throws {LotAggregateError} `NEGATIVE_QUANTITY` si una venta deja la cantidad en negativo
 *   por más de la tolerancia de redondeo (no admitimos cortos: no se puede vender lo que no se
 *   tiene; un exceso de hasta 10⁻⁶ se trata como 0), `OVERFLOW` si el resultado
 *   no cabe en `numeric(18,6)`.
 */
export function aggregateLots(lots: readonly AggregatableLot[]): LotAggregate {
  const ordered = [...lots].sort(compareLots);

  // `quantity` en escala 6 (sumas y restas exactas); `cost` en escala 12 (ver COST_SCALE).
  let quantity = 0n;
  let cost = 0n;

  for (const lot of ordered) {
    const q = parseDecimal(lot.quantity, AMOUNT_SCALE);
    const p = parseDecimal(lot.price, AMOUNT_SCALE);

    if (lot.kind === 'buy') {
      quantity += q;
      // escala 6 · escala 6 = escala 12: producto EXACTO, sin redondeo.
      cost += q * p;
      continue;
    }

    let remaining = quantity - q;
    if (remaining < 0n && -remaining <= SELL_ROUNDING_TOLERANCE) remaining = 0n;
    if (remaining < 0n) {
      throw new LotAggregateError(
        'NEGATIVE_QUANTITY',
        'La venta deja la posición en negativo: no puedes vender más de lo que tienes',
      );
    }
    // Retira coste al coste medio vigente. Se hace como `coste · restante / cantidad` (una
    // sola división) en vez de calcular el precio medio y multiplicar: así solo se redondea
    // una vez, no dos.
    cost = remaining === 0n || quantity === 0n ? 0n : divRoundHalfUp(cost * remaining, quantity);
    quantity = remaining;
  }

  // avgPrice = coste / cantidad. En unidades: (cost/10¹²) / (quantity/10⁶) · 10⁶ = cost/quantity.
  const avgPrice = quantity > 0n ? divRoundHalfUp(cost, quantity) : 0n;
  // Coste vivo llevado a escala 6 para exponerlo junto a los otros dos.
  const costAmount = divRoundHalfUp(cost, 10n ** BigInt(COST_SCALE - AMOUNT_SCALE));

  // Solo se comprueban los DOS valores que se escriben en `numeric(18,6)`. El coste vivo no
  // tiene columna (es informativo, para la futura fiscalidad), así que un coste enorme con
  // cantidad y precio medio dentro de rango es perfectamente válido y no debe rechazarse.
  for (const units of [quantity, avgPrice]) {
    if (units >= MAX_AMOUNT_UNITS * ONE_AMOUNT) {
      throw new LotAggregateError(
        'OVERFLOW',
        'El resultado de los lotes excede el máximo admitido por la posición',
      );
    }
  }

  return {
    quantity: formatDecimal(quantity, AMOUNT_SCALE),
    avgPrice: formatDecimal(avgPrice, AMOUNT_SCALE),
    cost: formatDecimal(costAmount, AMOUNT_SCALE),
  };
}
