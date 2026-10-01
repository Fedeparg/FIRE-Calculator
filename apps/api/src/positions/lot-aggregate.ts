// Agregación de lotes → (cantidad, precio medio) de una posición. Lógica pura y único sitio
// donde se decide la semántica del coste medio.
//
// Precisión: los `numeric` de Postgres llegan como `string` y se operan como enteros de coma
// fija (`bigint`); pasar por `number` introduce error binario (0.1 + 0.2 ≠ 0.3) que, sobre
// decenas de operaciones, desplaza el precio medio en céntimos.

import type { PositionLotKind } from '../db/schema.js';

/** Escala (decimales) de `position_lots.quantity/price` y de `positions.quantity/avg_price`. */
export const AMOUNT_SCALE = 6;

/**
 * Escala interna del coste acumulado: cantidad · precio son dos escalas 6, así que 12
 * decimales lo representan exactamente mientras solo haya compras. Solo la venta redondea
 * (half-up, `coste · (cantidad − vendida) / cantidad`): error máximo 5·10⁻¹³ por venta, seis
 * órdenes por debajo de la escala de almacenamiento.
 */
export const COST_SCALE = 12;

/** Un lote tal y como lo necesita la agregación (subconjunto de `PositionLot`). */
export interface AggregatableLot {
  id: string;
  kind: PositionLotKind;
  /** Decimal en `string`, tal y como lo devuelve Drizzle. */
  quantity: string;
  price: string;
  /** Fecha de la operación (YYYY-MM-DD). */
  tradedAt: string;
  /** Instante de alta; desempata los lotes del mismo día. */
  createdAt: Date;
}

/** Resultado de agregar: los dos campos que `positions` mantiene sincronizados. */
export interface LotAggregate {
  /** Cantidad viva = compras − ventas, decimal en `string` con 6 decimales. */
  quantity: string;
  avgPrice: string;
  /** Coste vivo (cantidad · precio medio). Informativo, sin columna propia: base de la futura fiscalidad de plusvalías. */
  cost: string;
}

/** Códigos de error de la agregación (el servicio los traduce a 400). */
export type LotAggregateErrorCode = 'NEGATIVE_QUANTITY' | 'OVERFLOW' | 'INVALID_DECIMAL';

export class LotAggregateError extends Error {
  constructor(
    readonly code: LotAggregateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LotAggregateError';
  }
}

/** Tope de `numeric(18,6)` (12 dígitos enteros): un 400 claro en vez de un 500 del driver. */
const MAX_AMOUNT_UNITS = 10n ** 12n;

const ONE_AMOUNT = 10n ** BigInt(AMOUNT_SCALE);

/**
 * Tolerancia de una venta: 1 unidad de la escala de la columna (10⁻⁶). Las cantidades se
 * redondean a 6 decimales al guardarlas (un bróker exporta hasta 10), así que vender "todo"
 * puede exceder lo comprado por redondeo: dentro de la tolerancia deja la posición en 0;
 * más allá es una venta de más (no hay cortos) y falla.
 */
const SELL_ROUNDING_TOLERANCE = 1n;

/** Solo decimales "planos" con signo opcional: nada de notación exponencial ni espacios. */
const PLAIN_DECIMAL = /^[+-]?(\d+)(?:\.(\d+))?$/;

/**
 * Convierte un decimal en `string` a entero de coma fija con `scale` decimales, con redondeo
 * half-up si trae más decimales de los que caben.
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

/** Inverso de `parseDecimal`. */
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
 * Orden canónico `(tradedAt, createdAt, id)`. `tradedAt` no lleva hora: sin desempate, el
 * coste medio móvil dependería del orden en que la BD devuelva las filas del mismo día.
 */
export function compareLots(a: AggregatableLot, b: AggregatableLot): number {
  if (a.tradedAt !== b.tradedAt) return a.tradedAt < b.tradedAt ? -1 : 1;
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Recorre los lotes en orden cronológico y devuelve cantidad viva y precio medio de coste
 * (lo que reflejan `positions.quantity` y `positions.avgPrice`).
 *
 * Semántica: coste medio móvil. Compra: `cantidad += q`, `coste += q · p`. Venta:
 * `cantidad −= q`, `coste −= q · precioMedioVigente` (el medio no cambia). No equivale a
 * promediar todas las compras: compra 10@100, venta 5, compra 5@200 → cantidad 10, medio 150
 * (no 133,33).
 *
 * @throws {LotAggregateError} `NEGATIVE_QUANTITY` si una venta deja la cantidad en negativo
 *   por encima de la tolerancia; `OVERFLOW` si el resultado no cabe en `numeric(18,6)`.
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
      // escala 6 · escala 6 = escala 12: producto exacto, sin redondeo.
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
    // `coste · restante / cantidad` en una sola división: se redondea una vez, no dos.
    cost = remaining === 0n || quantity === 0n ? 0n : divRoundHalfUp(cost * remaining, quantity);
    quantity = remaining;
  }

  // avgPrice = coste / cantidad. En unidades: (cost/10¹²) / (quantity/10⁶) · 10⁶ = cost/quantity.
  const avgPrice = quantity > 0n ? divRoundHalfUp(cost, quantity) : 0n;
  const costAmount = divRoundHalfUp(cost, 10n ** BigInt(COST_SCALE - AMOUNT_SCALE));

  // Solo se comprueban los dos valores que van a `numeric(18,6)`: el coste vivo no tiene
  // columna, así que uno enorme con cantidad y medio en rango es válido.
  for (const units of [quantity, avgPrice]) {
    if (units >= MAX_AMOUNT_UNITS * ONE_AMOUNT) {
      throw new LotAggregateError('OVERFLOW', 'El resultado de los lotes excede el máximo admitido por la posición');
    }
  }

  return {
    quantity: formatDecimal(quantity, AMOUNT_SCALE),
    avgPrice: formatDecimal(avgPrice, AMOUNT_SCALE),
    cost: formatDecimal(costAmount, AMOUNT_SCALE),
  };
}
