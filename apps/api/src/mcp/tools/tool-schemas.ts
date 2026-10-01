import { BREAKDOWN_GROUPS, type BreakdownGroupBy } from '@sextante/core/portfolio/breakdown';
import { SUPPORTED_CURRENCIES } from '@sextante/core/contracts';
import { FREQUENCIES, type Frequency } from '@sextante/core/projection';

/** Lista de divisas como tupla mutable para `z.enum` (SUPPORTED_CURRENCIES es `as const`). */
export const CURRENCY_VALUES = [...SUPPORTED_CURRENCIES] as [string, ...string[]];

/** Criterios de reparto como tupla para `z.enum`. */
export const BREAKDOWN_VALUES = [...BREAKDOWN_GROUPS] as [BreakdownGroupBy, ...BreakdownGroupBy[]];

/** Frecuencias de aportación como tupla para `z.enum`. */
export const FREQUENCY_VALUES = [...FREQUENCIES] as [Frequency, ...Frequency[]];
