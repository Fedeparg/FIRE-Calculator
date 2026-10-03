// i18n guardrail: `messages/es.json` and `messages/en.json` must expose exactly
// the same key tree and the same ICU arguments. Parity is up to whoever edits the
// messages (nothing is generated), so this test is the only safety net: a key added
// in just one locale leaves the UI showing the raw identifier in the other.

import { describe, expect, it } from "vitest";
import { defined } from "@sextante/core/assert";

import { flattenMessages, LOCALES, loadMessages, type Locale } from "./messages-fixtures";

/**
 * Names of a message's ICU arguments ("{year}" → "year";
 * "{count, plural, …}" → "count").
 *
 * It is a regex extractor, not an ICU parser: it only recognizes the argument
 * name when followed by "," or "}". That is enough for the project's actual
 * usage (simple arguments and the odd `plural`) and avoids depending on the
 * next-intl parser in a core test.
 */
function icuArguments(message: string): string[] {
  const names = [...message.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g)].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );
  return [...new Set(names)].sort();
}

const messages = new Map<Locale, Map<string, string>>(
  LOCALES.map((locale) => [locale, flattenMessages(loadMessages(locale))]),
);

/** Keys present in `from` that are missing from `to`. */
function missingKeys(from: Locale, to: Locale): string[] {
  const target = defined(messages.get(to));
  return [...defined(messages.get(from)).keys()].filter((key) => !target.has(key)).sort();
}

describe("es/en message parity", () => {
  it("neither locale has keys missing from the other", () => {
    expect({
      missingInEn: missingKeys("es", "en"),
      missingInEs: missingKeys("en", "es"),
    }).toEqual({ missingInEn: [], missingInEs: [] });
  });

  it("both locales have the same number of keys", () => {
    expect(defined(messages.get("en")).size).toBe(defined(messages.get("es")).size);
  });

  it("every key uses the same ICU arguments in both locales", () => {
    const es = defined(messages.get("es"));
    const en = defined(messages.get("en"));

    const mismatches = [...es.entries()]
      .filter(([key]) => en.has(key))
      .map(([key, esMessage]) => ({
        key,
        es: icuArguments(esMessage),
        en: icuArguments(defined(en.get(key))),
      }))
      .filter(({ es: esArgs, en: enArgs }) => esArgs.join("|") !== enArgs.join("|"));

    expect(mismatches).toEqual([]);
  });

  it("no key has an empty message", () => {
    for (const locale of LOCALES) {
      const empty = [...defined(messages.get(locale)).entries()]
        .filter(([, message]) => message.trim() === "")
        .map(([key]) => key);
      expect({ locale, empty }).toEqual({ locale, empty: [] });
    }
  });
});
