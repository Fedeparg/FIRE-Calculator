// Localized formatting. Pure core (no React), parameterized by locale.
//
// The UI language (`es` | `en`) determines the `Intl` locale: `es-ES` (thousands separator ".",
// decimal ",", and no grouping for 4-digit figures, per the Spanish standard) and `en-GB`
// (always groups from 4 digits: "£2,000.00"). Components get the active locale's formatter set
// with the `useFormat()` hook (see `@/shared/format/use-format`).
//
// `getFormatters(locale)` memoizes one set per locale: `Intl.NumberFormat` is expensive to
// create, so it is built once per locale and reused across renders.

import { type Locale } from "@/i18n/types";

/** UI language → `Intl` locale. `en-GB` and `en-US` are identical for numbers/currency. */
const INTL_LOCALE: Record<Locale, string> = { es: "es-ES", en: "en-GB" };

/**
 * Placeholder for unrepresentable values (Infinity, NaN, division by zero). Centralizing it
 * keeps each calculator from inventing its own guard and an undefined result from slipping
 * through as "0 €", which would be misleading.
 */
const NON_FINITE = "—";

/** Set of formatters bound to a locale. Returned by `getFormatters` / `useFormat`. */
export interface Formatters {
  /** Currency (EUR) without decimals (large figures: net worth, totals). */
  formatEUR: (n: number) => string;
  /** Currency (EUR) with 2 decimals (installments, small amounts). */
  formatEURCents: (n: number) => string;
  /** Integer with the locale's thousands separator. */
  formatNumber: (n: number) => string;
  /** Quantity of securities (fund units, shares, crypto): up to 6 decimals. */
  formatQuantity: (n: number) => string;
  /** Coefficient or multiplier with 2-4 decimals (e.g. 1.5882). */
  formatMultiplier: (n: number) => string;
  /** Compact notation for chart axes ("1,2 M €"). */
  formatCompactEUR: (n: number) => string;
  /** Compact notation in an arbitrary currency, for chart axes in the chosen currency. */
  formatCompactCurrency: (n: number, currency: string) => string;
  /**
   * Takes a base-100 percentage (7 → "7 %"). By default it omits decimals that add nothing,
   * which reads naturally in prose and legends.
   *
   * `minDecimals` forces them: in a COLUMN of comparable figures, "39,4 %" between "15,34 %"
   * and "28,48 %" reads as if it were less precise than the others, when it is really 39.40%.
   * Pass `{ minDecimals: 2 }` there.
   */
  formatPercent: (n: number, options?: { minDecimals?: number }) => string;
  /** Amount in an arbitrary currency (EUR/USD/GBP/JPY…), for portfolio positions. */
  formatCurrency: (n: number, currency: string) => string;
  /**
   * Like `formatCurrency` but with an explicit sign for gains and losses ("+1.234,56 €",
   * "-3,00 €"). Zero (and anything rounding to zero, and -0) is unsigned: "+0,00 €" or "-0,00 €"
   * would suggest a gain or loss that does not exist.
   */
  formatSignedCurrency: (n: number, currency: string) => string;
  /** Like `formatPercent` but with an explicit sign ("+5,2 %"), with the same zero rule. */
  formatSignedPercent: (n: number, options?: { minDecimals?: number }) => string;
  /** Short currency symbol ("€", "$", "£", "CHF"…) in the active locale. */
  currencySymbol: (currency: string) => string;
  /** Compact currency label for selectors: "€ EUR", "$ USD"… */
  currencyLabel: (currency: string) => string;
  /** The locale's decimal separator ("," in es, "." in en). For editable input fields. */
  decimalSeparator: string;
}

/** Builds a formatter set for a locale. Caches internally per currency. */
function build(locale: Locale): Formatters {
  const l = INTL_LOCALE[locale];

  // `signDisplay: "negative"`: without it, -0.4 € rounded to 0 comes out as "-0 €".
  const eur = new Intl.NumberFormat(l, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    signDisplay: "negative",
  });
  const eurCents = new Intl.NumberFormat(l, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const num = new Intl.NumberFormat(l, { maximumFractionDigits: 0 });
  // Quantities: up to 6 decimals (the DB stores `numeric(18,6)`), without forcing decimals so an
  // integer shows cleanly. Rounding to an integer would misreport 1368.8 → "1.369" and hide
  // 0.5 BTC as "1".
  const quantity = new Intl.NumberFormat(l, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
  const multiplier = new Intl.NumberFormat(l, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  const compact = new Intl.NumberFormat(l, { notation: "compact", maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(l, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  // Variant with ALWAYS two decimals, for columns of aligned figures (see `formatPercent`).
  const pctFixed2 = new Intl.NumberFormat(l, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // `exceptZero`: "+" for positives, "-" for negatives and nothing for an already rounded zero.
  const signedPct = new Intl.NumberFormat(l, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  });
  const signedPctFixed2 = new Intl.NumberFormat(l, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  });

  // Per-currency caches (inside the locale's closure: each locale has its own). Otherwise a
  // global per-currency cache would return the formatter of whichever locale touched it first.
  const currencyFormatters = new Map<string, Intl.NumberFormat>();
  const signedCurrencyFormatters = new Map<string, Intl.NumberFormat>();
  const compactCurrencyFormatters = new Map<string, Intl.NumberFormat>();
  const currencySymbols = new Map<string, string>();
  // For a currency `Intl` does not know (an invalid ISO code in imported data): the amount with
  // two decimals followed by the code, instead of a `RangeError` mid-render.
  const plainAmount = new Intl.NumberFormat(l, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signedPlainAmount = new Intl.NumberFormat(l, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  });

  /** Currency `Intl.NumberFormat`, or `null` if the code is invalid. */
  const currencyFormat = (options: Intl.NumberFormatOptions): Intl.NumberFormat | null => {
    try {
      return new Intl.NumberFormat(l, options);
    } catch {
      return null;
    }
  };

  const formatCurrency = (n: number, currency: string): string => {
    if (!Number.isFinite(n)) return NON_FINITE;
    let fmt = currencyFormatters.get(currency);
    if (!fmt) {
      // `Intl` picks the decimals per currency (EUR/USD → 2, JPY → 0): forcing 2 would break the yen.
      const created = currencyFormat({ style: "currency", currency });
      if (!created) return `${plainAmount.format(n)} ${currency}`;
      fmt = created;
      currencyFormatters.set(currency, fmt);
    }
    return fmt.format(n);
  };

  const formatSignedCurrency = (n: number, currency: string): string => {
    if (!Number.isFinite(n)) return NON_FINITE;
    let fmt = signedCurrencyFormatters.get(currency);
    if (!fmt) {
      const created = currencyFormat({ style: "currency", currency, signDisplay: "exceptZero" });
      if (!created) return `${signedPlainAmount.format(n)} ${currency}`;
      fmt = created;
      signedCurrencyFormatters.set(currency, fmt);
    }
    return fmt.format(n);
  };

  // Compact WITH currency: delegated to `Intl` (style "currency" + notation "compact") instead of
  // gluing the symbol by hand, because the symbol position depends on the locale ("1,2 M €" in
  // es, "€1.2M" in en) and on the currency code itself.
  const formatCompactCurrency = (n: number, currency: string): string => {
    if (!Number.isFinite(n)) return NON_FINITE;
    let fmt = compactCurrencyFormatters.get(currency);
    if (!fmt) {
      const created = currencyFormat({ style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
      if (!created) return `${compact.format(n)} ${currency}`;
      fmt = created;
      compactCurrencyFormatters.set(currency, fmt);
    }
    return fmt.format(n);
  };

  const currencySymbol = (currency: string): string => {
    let symbol = currencySymbols.get(currency);
    if (symbol === undefined) {
      const parts = currencyFormat({ style: "currency", currency, currencyDisplay: "narrowSymbol" })?.formatToParts(0);
      symbol = parts?.find((p) => p.type === "currency")?.value ?? currency;
      currencySymbols.set(currency, symbol);
    }
    return symbol;
  };

  return {
    formatEUR: (n) => (Number.isFinite(n) ? eur.format(n) : NON_FINITE),
    formatEURCents: (n) => (Number.isFinite(n) ? eurCents.format(n) : NON_FINITE),
    formatNumber: (n) => (Number.isFinite(n) ? num.format(n) : NON_FINITE),
    formatQuantity: (n) => (Number.isFinite(n) ? quantity.format(n) : NON_FINITE),
    formatMultiplier: (n) => (Number.isFinite(n) ? multiplier.format(n) : NON_FINITE),
    // The symbol position depends on the locale ("1,2 M €" / "€1.2M"): `Intl` decides it.
    formatCompactEUR: (n) => formatCompactCurrency(n, "EUR"),
    formatCompactCurrency,
    formatPercent: (n, options) =>
      Number.isFinite(n) ? (options?.minDecimals === 2 ? pctFixed2 : pct).format(n / 100) : NON_FINITE,
    formatSignedPercent: (n, options) =>
      Number.isFinite(n) ? (options?.minDecimals === 2 ? signedPctFixed2 : signedPct).format(n / 100) : NON_FINITE,
    formatCurrency,
    formatSignedCurrency,
    currencySymbol,
    // The ISO code is ALWAYS included (symbols collide: $ → USD/CAD/AUD/HKD/SGD, ¥ → JPY/CNY).
    // If the currency has no symbol of its own (CHF), `currencySymbol` already returns the code.
    currencyLabel: (currency) => {
      const symbol = currencySymbol(currency);
      return symbol === currency ? currency : `${symbol} ${currency}`;
    },
    // `num` rounds to an integer, so it cannot probe the separator: use a clean one.
    decimalSeparator: new Intl.NumberFormat(l).formatToParts(1.1).find((p) => p.type === "decimal")?.value ?? ".",
  };
}

// One formatter set per locale, built once and reused. Safe as a module singleton (immutable,
// deterministic content per locale; no per-request state).
const cache = new Map<Locale, Formatters>();

/** Returns the formatter set for the given locale (memoized). */
export function getFormatters(locale: Locale): Formatters {
  let f = cache.get(locale);
  if (!f) {
    f = build(locale);
    cache.set(locale, f);
  }
  return f;
}

/** Reformats an ISO "YYYY-MM-DD" date as "DD/MM/YYYY" without building a Date (no time-zone shift). */
export const formatIsoDate = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Long date per locale ("3 de septiembre de 2026" / "3 September 2026"). One per locale,
// memoized like the numeric formatters.
const longDateFormatters = new Map<Locale, Intl.DateTimeFormat>();

/**
 * ISO "YYYY-MM-DD" date → long date in the given locale.
 *
 * The day is anchored in UTC (`Date.UTC` + `timeZone: "UTC"`) for two reasons: a plain date has
 * no time, and without anchoring, a browser in a zone behind UTC would show the previous day;
 * it also makes the result identical on server and client, which avoids a hydration mismatch.
 * Returns the ISO string as is if it is not a parseable date, so no day is made up.
 */
export const formatLongDate = (iso: string, locale: Locale): string => {
  const [y = NaN, m = NaN, d = NaN] = iso.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;

  const timestamp = Date.UTC(y, m - 1, d);
  if (Number.isNaN(timestamp)) return iso;

  let fmt = longDateFormatters.get(locale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    longDateFormatters.set(locale, fmt);
  }
  return fmt.format(timestamp);
};

// Relative time per locale ("hace 5 minutos" / "5 minutes ago"), memoized like the rest.
const relativeTimeFormatters = new Map<Locale, Intl.RelativeTimeFormat>();

/** Relative-time steps: the unit is picked by the size of the difference. */
const RELATIVE_STEPS: readonly { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "day", seconds: 86_400 },
  { unit: "hour", seconds: 3_600 },
  { unit: "minute", seconds: 60 },
];

/**
 * ISO instant → time relative to `now` (milliseconds), in the given locale: "a moment ago",
 * "5 minutes ago", "2 hours ago", "yesterday". It rounds DOWN (58 minutes is "58 minutes ago",
 * not "1 hour ago"), which is the honest choice when describing how fresh data is. A future
 * instant (skewed clocks) counts as "now". Returns "—" if it cannot be read.
 *
 * `now` is passed in instead of reading the clock so the function stays pure and testable.
 */
export function formatRelativeTime(iso: string, now: number, locale: Locale): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp) || !Number.isFinite(now)) return NON_FINITE;

  let fmt = relativeTimeFormatters.get(locale);
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" });
    relativeTimeFormatters.set(locale, fmt);
  }

  const elapsed = Math.max(0, (now - timestamp) / 1000);
  for (const { unit, seconds } of RELATIVE_STEPS) {
    if (elapsed >= seconds) return fmt.format(-Math.floor(elapsed / seconds), unit);
  }
  return fmt.format(0, "second");
}
