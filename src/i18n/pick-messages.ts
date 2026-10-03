import type { AbstractIntlMessages } from "next-intl";
import { lastItem } from "@sextante/core/arrays";

/**
 * Subconjunto del catálogo con solo los namespaces pedidos (`"nav"`, `"auth.nav"`…). Un
 * namespace con puntos conserva su ruta (`auth.nav` -> `{ auth: { nav } }`), que es lo que
 * `useTranslations("auth.nav")` espera encontrar. Lanza si un namespace no existe: es un
 * error de declaración que debe romper el build, no dejar una página con claves a medias.
 */
export function pickMessages(messages: AbstractIntlMessages, namespaces: readonly string[]): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const namespace of namespaces) {
    const path = namespace.split(".");
    const leaf = path.reduce<AbstractIntlMessages | string | undefined>(
      (node, segment) => (typeof node === "object" ? node[segment] : undefined),
      messages,
    );
    if (typeof leaf !== "object") throw new Error(`Unknown i18n namespace "${namespace}"`);

    let target = picked;
    for (const segment of path.slice(0, -1)) {
      const next = target[segment];
      if (typeof next === "object") {
        target = next;
      } else {
        const created: AbstractIntlMessages = {};
        target[segment] = created;
        target = created;
      }
    }
    // `split` nunca devuelve una lista vacía: siempre hay un último segmento.
    target[lastItem(path)] = leaf;
  }
  return picked;
}
