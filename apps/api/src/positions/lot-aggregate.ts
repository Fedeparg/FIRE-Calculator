// Agregación pura de lotes → (cantidad, precio medio). Los `numeric` llegan como `string` y se
// operan como enteros de coma fija (`bigint`): pasar por `number` desplazaría el precio medio
// en céntimos por error binario.

import { compareStrings } from '@sextante/core/compare';
import { DomainError } from '../common/domain-error.js';
import type { PositionLotKind } from '../db/schema.js';

/** Escala (decimales) de `position_lots.quantity/price` y de `positions.quantity/avg_price`. */
export const AMOUNT_SCALE = 6;

/** Escala del coste acumulado (cantidad · precio = 12 decimales exactos). Solo la venta redondea, half-up: error máximo 5·10⁻¹³. */
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
  quantity: string;
  avgPrice: string;
  /** Coste vivo (cantidad · precio medio); informativo, sin columna propia. */
  cost: string;
}

/** Códigos de error de la agregación (el borde los traduce a 400; ver `DomainError`). */
export type LotAggregateErrorCode = 'NEGATIVE_QUANTITY' | 'OVERFLOW' | 'INVALID_DECIMAL';

export class LotAggregateError extends DomainError {
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

/** Vender "todo" puede exceder lo comprado por el redondeo a 6 decimales (un bróker exporta hasta 10): dentro de 10⁻⁶ queda en 0; más allá es una venta de más (sin cortos) y falla. */
const SELL_ROUNDING_TOLERANCE = 1n;

/** Solo decimales "planos" con signo opcional: nada de notación exponencial ni espacios. */
const PLAIN_DECIMAL = /^[+-]?(\d+)(?:\.(\d+))?$/;

/** Decimal en `string` → entero de coma fija con `scale` decimales (half-up si trae más). */
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
  if (a.tradedAt !== b.tradedAt) return compareStrings(a.tradedAt, b.tradedAt);
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta - tb;
  return compareStrings(a.id, b.id);
}

/**
 * Cantidad viva y precio medio por coste medio móvil: la compra suma `q` y `q · p`; la venta
 * resta `q` y `q · precioMedioVigente` (el medio no cambia). No es el promedio de todas las
 * compras: 10@100, venta 5, 5@200 → cantidad 10, medio 150 (no 133,33).
 *
 * @throws {LotAggregateError} `NEGATIVE_QUANTITY` (venta de más, fuera de tolerancia) u
 *   `OVERFLOW` (no cabe en `numeric(18,6)`).
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

  // Solo los dos valores que van a `numeric(18,6)`; el coste vivo no tiene columna.
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
