import type { AbstractIntlMessages } from "next-intl";
import { lastItem } from "@sextante/core/arrays";

/**
 * Subset of the catalog with only the requested namespaces (`"nav"`, `"auth.nav"`…). A dotted
 * namespace keeps its path (`auth.nav` -> `{ auth: { nav } }`), which is what
 * `useTranslations("auth.nav")` expects to find. Throws if a namespace does not exist: that is
 * a declaration error that must break the build, not leave a page with half its keys.
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
    // `split` never returns an empty list: there is always a last segment.
    target[lastItem(path)] = leaf;
  }
  return picked;
}
