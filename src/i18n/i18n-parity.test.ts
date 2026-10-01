// Guardarraíl de i18n: `messages/es.json` y `messages/en.json` deben exponer
// exactamente el mismo árbol de claves y los mismos argumentos ICU. La paridad
// la garantiza quien edita los mensajes (no hay generación automática), así que
// este test es la única red de seguridad: una clave añadida en un solo idioma
// deja la UI con el identificador crudo en el otro.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCALES = ["es", "en"] as const;

type Locale = (typeof LOCALES)[number];
type MessageTree = { readonly [key: string]: string | MessageTree };

function loadMessages(locale: Locale): MessageTree {
  const file = path.join(ROOT, "messages", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as MessageTree;
}

/** Aplana el árbol de mensajes a rutas de hoja ("calc.roi.title"). */
function flattenMessages(tree: MessageTree, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const fullKey = `${prefix}${key}`;
    if (typeof value === "string") {
      flat.set(fullKey, value);
    } else {
      for (const [nested, message] of flattenMessages(value, `${fullKey}.`)) {
        flat.set(nested, message);
      }
    }
  }
  return flat;
}

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
  const names = [...message.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g)].map((m) => m[1]);
  return [...new Set(names)].sort();
}

const messages = new Map<Locale, Map<string, string>>(
  LOCALES.map((locale) => [locale, flattenMessages(loadMessages(locale))]),
);

/** Claves presentes en `from` que faltan en `to`. */
function missingKeys(from: Locale, to: Locale): string[] {
  const target = messages.get(to)!;
  return [...messages.get(from)!.keys()].filter((key) => !target.has(key)).sort();
}

describe("paridad de mensajes es/en", () => {
  it("ningún idioma tiene claves que le falten al otro", () => {
    expect({
      missingInEn: missingKeys("es", "en"),
      missingInEs: missingKeys("en", "es"),
    }).toEqual({ missingInEn: [], missingInEs: [] });
  });

  it("ambos idiomas tienen el mismo número de claves", () => {
    expect(messages.get("en")!.size).toBe(messages.get("es")!.size);
  });

  it("cada clave usa los mismos argumentos ICU en ambos idiomas", () => {
    const es = messages.get("es")!;
    const en = messages.get("en")!;

    const mismatches = [...es.entries()]
      .filter(([key]) => en.has(key))
      .map(([key, esMessage]) => ({
        key,
        es: icuArguments(esMessage),
        en: icuArguments(en.get(key)!),
      }))
      .filter(({ es: esArgs, en: enArgs }) => esArgs.join("|") !== enArgs.join("|"));

    expect(mismatches).toEqual([]);
  });

  it("ninguna clave tiene un mensaje vacío", () => {
    for (const locale of LOCALES) {
      const empty = [...messages.get(locale)!.entries()]
        .filter(([, message]) => message.trim() === "")
        .map(([key]) => key);
      expect({ locale, empty }).toEqual({ locale, empty: [] });
    }
  });
});
