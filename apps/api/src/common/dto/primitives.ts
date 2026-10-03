import { z } from 'zod';

import { SUPPORTED_CURRENCIES } from '@sextante/core/contracts';
import { ASSET_CLASSES } from '@sextante/core/portfolio/types';

// Piezas de esquema que comparten los DTO de posiciones, lotes, cobros y declaración. Viven aquí y
// no en un DTO concreto para que un módulo no dependa de los DTO de otro.

/**
 * Tope de `quantity` y `avgPrice`: `numeric(18,6)` admite 12 dígitos enteros y el máximo es
 * inclusivo, así que pasar del mayor entero de 12 dígitos da 400 en vez de un overflow (500).
 */
export const NUMERIC_MAX = 999_999_999_999;

/** Cantidad estrictamente positiva con a lo sumo 6 decimales (la escala de `numeric(18,6)`). */
export const quantitySchema = z
  .number()
  .positive()
  .max(NUMERIC_MAX)
  .refine((value) => hasAtMostSixDecimals(value), { error: 'máximo 6 decimales' });

/** Importe no negativo (precio, comisión) con a lo sumo 6 decimales. */
export const amountSchema = z
  .number()
  .min(0)
  .max(NUMERIC_MAX)
  .refine((value) => hasAtMostSixDecimals(value), { error: 'máximo 6 decimales' });

function hasAtMostSixDecimals(value: number): boolean {
  return Number(value.toFixed(6)) === value;
}

/** Texto sin espacios sobrantes y con tope de longitud (el recorte va antes de validar). */
export const trimmedText = (max: number) => z.string().trim().max(max);

/** Divisa admitida; la compara contra la de la posición el servicio, no el esquema. */
export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

/** Clase de activo: decide el bloque de la declaración en que van sus ventas. */
export const assetClassSchema = z.enum(ASSET_CLASSES);
