import fc from "fast-check";
import { describe, it } from "vitest";

import { getFormatters } from "./format";
import { PROPERTY_PARAMS } from "../../../packages/core/src/test-support/property-config";
import { LOCALES } from "@/i18n/types";

const NON_FINITE = "—";
const locale = fc.constantFrom(...LOCALES);
const nonFinite = fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e15, max: 1e15 });

/** Every numeric formatter, with the currency fixed where needed. */
function numericFormatters(l: (typeof LOCALES)[number]): ((n: number) => string)[] {
  const f = getFormatters(l);
  return [
    f.formatEUR,
    f.formatEURCents,
    f.formatNumber,
    f.formatQuantity,
    f.formatMultiplier,
    f.formatCompactEUR,
    (n) => f.formatCompactCurrency(n, "USD"),
    (n) => f.formatPercent(n),
    (n) => f.formatCurrency(n, "JPY"),
  ];
}

describe("format — properties", () => {
  it("always shows a non-finite value as «—», in every formatter and locale", () => {
    fc.assert(
      fc.property(locale, nonFinite, (l, n) => numericFormatters(l).every((format) => format(n) === NON_FINITE)),
      PROPERTY_PARAMS,
    );
  });

  it("never shows a finite value as «—» or as NaN/Infinity", () => {
    fc.assert(
      fc.property(locale, finite, (l, n) =>
        numericFormatters(l).every((format) => {
          const text = format(n);
          return text !== NON_FINITE && !/NaN|Infinity|∞/.test(text);
        }),
      ),
      PROPERTY_PARAMS,
    );
  });
});
