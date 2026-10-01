// Utilidades de los tests de i18n: cargan `messages/*.json` y los aplanan a rutas
// de hoja ("calc.roi.title"). Solo las importan tests.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];
type MessageTree = { readonly [key: string]: string | MessageTree };

export function loadMessages(locale: Locale): MessageTree {
  const file = path.join(ROOT, "messages", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as MessageTree;
}

/** Aplana el árbol de mensajes a rutas de hoja ("calc.roi.title"). */
export function flattenMessages(tree: MessageTree, prefix = ""): Map<string, string> {
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
