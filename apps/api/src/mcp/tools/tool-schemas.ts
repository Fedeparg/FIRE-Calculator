import { BREAKDOWN_GROUPS, type BreakdownGroupBy } from '@sextante/core/portfolio/breakdown';
import { SUPPORTED_CURRENCIES } from '@sextante/core/contracts';
import { FREQUENCIES, type Frequency } from '@sextante/core/projection';

/** Currency list as a mutable tuple for `z.enum` (SUPPORTED_CURRENCIES is `as const`). */
export const CURRENCY_VALUES = [...SUPPORTED_CURRENCIES] as [string, ...string[]];

/** Breakdown criteria as a tuple for `z.enum`. */
export const BREAKDOWN_VALUES = [...BREAKDOWN_GROUPS] as [BreakdownGroupBy, ...BreakdownGroupBy[]];

/** Contribution frequencies as a tuple for `z.enum`. */
export const FREQUENCY_VALUES = [...FREQUENCIES] as [Frequency, ...Frequency[]];
