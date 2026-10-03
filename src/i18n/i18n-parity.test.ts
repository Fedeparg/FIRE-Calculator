// Guardarraíl de i18n: `messages/es.json` y `messages/en.json` deben exponer
// exactamente el mismo árbol de claves y los mismos argumentos ICU. La paridad
// la garantiza quien edita los mensajes (no hay generación automática), así que
// este test es la única red de seguridad: una clave añadida en un solo idioma
// deja la UI con el identificador crudo en el otro.

import { describe, expect, it } from "vitest";
import { defined } from "@sextante/core/assert";

import { flattenMessages, LOCALES, loadMessages, type Locale } from "./messages-fixtures";

/**
 * Nombres de los argumentos ICU de un mensaje ("{year}" → "year";
 * "{count, plural, …}" → "count").
 *
 * Es un extractor por expresión regular, no un parser de ICU: solo reconoce el
 * nombre del argumento cuando va seguido de "," o "}". Basta para el uso real
 * del proyecto (argumentos simples y algún `plural`) y evita depender del
 * parser de next-intl en un test de core.
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

/** Claves presentes en `from` que faltan en `to`. */
function missingKeys(from: Locale, to: Locale): string[] {
  const target = defined(messages.get(to));
  return [...defined(messages.get(from)).keys()].filter((key) => !target.has(key)).sort();
}

describe("paridad de mensajes es/en", () => {
  it("ningún idioma tiene claves que le falten al otro", () => {
    expect({
      missingInEn: missingKeys("es", "en"),
      missingInEs: missingKeys("en", "es"),
    }).toEqual({ missingInEn: [], missingInEs: [] });
  });

  it("ambos idiomas tienen el mismo número de claves", () => {
    expect(defined(messages.get("en")).size).toBe(defined(messages.get("es")).size);
  });

  it("cada clave usa los mismos argumentos ICU en ambos idiomas", () => {
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

  it("ninguna clave tiene un mensaje vacío", () => {
    for (const locale of LOCALES) {
      const empty = [...defined(messages.get(locale)).entries()]
        .filter(([, message]) => message.trim() === "")
        .map(([key]) => key);
      expect({ locale, empty }).toEqual({ locale, empty: [] });
    }
  });
});
