import { describe, expect, it } from "vitest";
import { formatLongDate, formatRelativeTime, getFormatters } from "./format";

const es = getFormatters("es");
const en = getFormatters("en");

describe("formatCurrency", () => {
  it("uses es-ES separators (decimal comma) and two decimals", () => {
    // The symbol is separated by a thin space that varies with the ICU version; what is stable
    // is the decimal comma, the two decimals and the euro sign.
    expect(es.formatCurrency(1234.5, "EUR")).toMatch(/^1234,50\s?€$/u);
    expect(es.formatCurrency(5, "EUR")).toMatch(/^5,00\s?€$/u);
  });

  it("groups thousands according to the locale", () => {
    // Spanish rule (RAE/CLDR): 4-digit figures have NO thousands separator, but from 5 digits
    // on they do (10.000). This is the core of format localization.
    expect(es.formatCurrency(2000, "EUR")).toContain("2000,00");
    expect(es.formatCurrency(12345, "EUR")).toContain("12.345,00");
    // English (en-GB): ALWAYS groups from 4 digits, comma for thousands and decimal point.
    expect(en.formatCurrency(2000, "EUR")).toContain("2,000.00");
    expect(en.formatCurrency(12345, "EUR")).toContain("12,345.00");
  });

  it("formats the amount in the given currency", () => {
    // The exact symbol depends on the ICU version; what is stable is the amount and its decimal separator.
    expect(es.formatCurrency(1000, "USD")).toContain("1000,00");
    expect(es.formatCurrency(99.9, "GBP")).toContain("99,90");
    expect(en.formatCurrency(99.9, "GBP")).toContain("99.90");
  });

  it("returns the '—' placeholder for non-finite values in both locales", () => {
    expect(es.formatCurrency(Number.NaN, "EUR")).toBe("—");
    expect(en.formatCurrency(Number.POSITIVE_INFINITY, "USD")).toBe("—");
  });

  it("degrades to amount + ISO code for a currency Intl does not know, without throwing", () => {
    expect(es.formatCurrency(12.5, "EURO")).toBe("12,50 EURO");
    expect(es.formatCompactCurrency(1_200_000, "EURO")).toMatch(/^1,2\sM EURO$/u);
    expect(es.currencySymbol("EURO")).toBe("EURO");
  });
});

describe("formatEUR", () => {
  it("does not write '-0 €' when rounding a small negative", () => {
    expect(es.formatEUR(-0.4)).toMatch(/^0\s?€$/u);
    expect(es.formatEUR(-0.6)).toMatch(/^-1\s?€$/u);
  });
});

describe("formatCompactEUR", () => {
  it("places the symbol according to the locale", () => {
    expect(es.formatCompactEUR(1_200_000)).toMatch(/^1,2\sM\s€$/u);
    expect(en.formatCompactEUR(1_200_000)).toMatch(/^€1\.2[mM]$/u);
  });
});

describe("formatQuantity", () => {
  it("keeps the quantity's decimals (does not round to an integer)", () => {
    // The real case behind the fix: 1368.8 fund units must not round to 1369.
    expect(es.formatQuantity(1368.8)).toBe("1368,8");
    // Fractions < 1 (e.g. crypto) must not collapse to "0".
    expect(es.formatQuantity(0.5)).toBe("0,5");
    expect(es.formatQuantity(0.00123456)).toBe("0,001235");
  });

  it("shows an integer without superfluous decimals", () => {
    expect(es.formatQuantity(1369)).toBe("1369");
    expect(es.formatQuantity(0)).toBe("0");
  });

  it("caps at 6 decimals (the stored precision)", () => {
    // numeric(18,6): beyond 6 decimals it rounds; no made-up precision.
    expect(es.formatQuantity(1.2345678)).toBe("1,234568");
  });

  it("returns the '—' placeholder for non-finite values", () => {
    expect(es.formatQuantity(Number.NaN)).toBe("—");
    expect(es.formatQuantity(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("takes base 100 and uses the locale's decimal separator", () => {
    expect(es.formatPercent(7)).toMatch(/^7\s?%$/u);
    expect(es.formatPercent(3.25)).toMatch(/^3,25\s?%$/u);
    expect(en.formatPercent(3.25)).toMatch(/^3\.25%$/u);
  });

  // Regression: in the portfolio's return column, 39.40% was written as "39,4 %" among
  // two-decimal values, and read as if it had less precision.
  it("with minDecimals keeps trailing-zero decimals", () => {
    expect(es.formatPercent(39.4, { minDecimals: 2 })).toMatch(/^39,40\s?%$/u);
    expect(es.formatPercent(16, { minDecimals: 2 })).toMatch(/^16,00\s?%$/u);
    expect(en.formatPercent(39.4, { minDecimals: 2 })).toMatch(/^39\.40%$/u);
  });

  it("without minDecimals still omits decimals that add nothing", () => {
    expect(es.formatPercent(39.4)).toMatch(/^39,4\s?%$/u);
    expect(es.formatPercent(16)).toMatch(/^16\s?%$/u);
  });

  it("does not break on non-finite values", () => {
    expect(es.formatPercent(Number.NaN, { minDecimals: 2 })).toBe("—");
    expect(es.formatPercent(Number.POSITIVE_INFINITY, { minDecimals: 2 })).toBe("—");
  });
});

describe("decimalSeparator", () => {
  it("is a comma in Spanish and a point in English", () => {
    expect(es.decimalSeparator).toBe(",");
    expect(en.decimalSeparator).toBe(".");
  });
});

describe("formatLongDate", () => {
  it("writes the long date in the requested locale", () => {
    expect(formatLongDate("2026-09-03", "es")).toBe("3 de septiembre de 2026");
    expect(formatLongDate("2026-09-03", "en")).toBe("3 September 2026");
  });

  it("does not shift by a day because of the time zone", () => {
    // Anchors the day in UTC: in a zone behind UTC (e.g. America/New_York),
    // `new Date("2026-01-01")` formatted in local time would give 31 December.
    const original = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(formatLongDate("2026-01-01", "es")).toBe("1 de enero de 2026");
    } finally {
      process.env.TZ = original;
    }
  });

  it("returns the string as is if it is not a parseable date", () => {
    expect(formatLongDate("no es una fecha", "es")).toBe("no es una fecha");
    expect(formatLongDate("", "es")).toBe("");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("treats less than a minute as «now»", () => {
    expect(formatRelativeTime(ago(20), now, "es")).toBe("ahora");
    expect(formatRelativeTime(ago(20), now, "en")).toBe("now");
  });

  it("picks the unit by magnitude and rounds down", () => {
    expect(formatRelativeTime(ago(5 * 60 + 59), now, "es")).toBe("hace 5 minutos");
    expect(formatRelativeTime(ago(58 * 60), now, "en")).toBe("58 minutes ago");
    expect(formatRelativeTime(ago(2 * 3600 + 10), now, "es")).toBe("hace 2 horas");
    expect(formatRelativeTime(ago(26 * 3600), now, "es")).toBe("ayer");
    expect(formatRelativeTime(ago(3 * 86_400), now, "en")).toBe("3 days ago");
  });

  it("treats a future instant as «now» and an unreadable one as «—»", () => {
    expect(formatRelativeTime(ago(-3600), now, "es")).toBe("ahora");
    expect(formatRelativeTime("no es una fecha", now, "es")).toBe("—");
    expect(formatRelativeTime(ago(10), Number.NaN, "es")).toBe("—");
  });
});

describe("formatSignedCurrency / formatSignedPercent", () => {
  const es = getFormatters("es");
  const en = getFormatters("en");

  it("adds + to gains and leaves the rest as formatCurrency", () => {
    expect(es.formatSignedCurrency(1234.5, "EUR")).toBe(`+${es.formatCurrency(1234.5, "EUR")}`);
    expect(en.formatSignedCurrency(12, "USD")).toBe(`+${en.formatCurrency(12, "USD")}`);
    expect(es.formatSignedCurrency(-3, "EUR")).toBe(es.formatCurrency(-3, "EUR"));
  });

  it("leaves zero, -0 and anything rounding to zero unsigned", () => {
    const zero = es.formatCurrency(0, "EUR");
    expect(es.formatSignedCurrency(0, "EUR")).toBe(zero);
    expect(es.formatSignedCurrency(-0, "EUR")).toBe(zero);
    expect(es.formatSignedCurrency(0.001, "EUR")).toBe(zero);
    expect(es.formatSignedCurrency(-0.001, "EUR")).toBe(zero);
  });

  it("does not break on an unknown currency or non-finite values", () => {
    expect(es.formatSignedCurrency(5, "XX1")).toBe(`+${es.formatCurrency(5, "XX1")}`);
    expect(es.formatSignedCurrency(Number.NaN, "EUR")).toBe("—");
  });

  it("signs percentages with the same zero rule", () => {
    expect(es.formatSignedPercent(5.2)).toBe(`+${es.formatPercent(5.2)}`);
    expect(es.formatSignedPercent(-5.2, { minDecimals: 2 })).toBe(es.formatPercent(-5.2, { minDecimals: 2 }));
    expect(es.formatSignedPercent(-0)).toBe(es.formatPercent(0));
    expect(es.formatSignedPercent(Infinity)).toBe("—");
  });
});
