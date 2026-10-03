import { z } from 'zod';

import { SUPPORTED_CURRENCIES } from '@sextante/core/contracts';
import { ASSET_CLASSES } from '@sextante/core/portfolio/types';

// Schema building blocks shared by the position, lot, income and tax return DTOs. They live here
// rather than in a specific DTO so that no module depends on another module's DTOs.

/**
 * Upper bound of `quantity` and `avgPrice`: `numeric(18,6)` allows 12 integer digits and the maximum
 * is inclusive, so going past the largest 12-digit integer gives a 400 instead of an overflow (500).
 */
export const NUMERIC_MAX = 999_999_999_999;

/** Strictly positive quantity with at most 6 decimals (the scale of `numeric(18,6)`). */
export const quantitySchema = z
  .number()
  .positive()
  .max(NUMERIC_MAX)
  .refine((value) => hasAtMostSixDecimals(value), { error: 'máximo 6 decimales' });

/** Non-negative amount (price, fee) with at most 6 decimals. */
export const amountSchema = z
  .number()
  .min(0)
  .max(NUMERIC_MAX)
  .refine((value) => hasAtMostSixDecimals(value), { error: 'máximo 6 decimales' });

function hasAtMostSixDecimals(value: number): boolean {
  return Number(value.toFixed(6)) === value;
}

/** Text without surrounding whitespace and with a length cap (trimming happens before validation). */
export const trimmedText = (max: number) => z.string().trim().max(max);

/** Supported currency; the service, not the schema, checks it against the position's currency. */
export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

/** Asset class: decides which block of the tax return its sales go into. */
export const assetClassSchema = z.enum(ASSET_CLASSES);
