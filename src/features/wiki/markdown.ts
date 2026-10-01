import "server-only";

import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { localizeHref } from "@/i18n/localize-href";
import type { Locale } from "@/core/types";

/** Nodo mínimo del árbol HTML (hast) que recorre `rehypeLocalizeLinks`. */
type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * Plugin de rehype: prefija con el idioma los enlaces internos (`<a href="/…">`), para que un
 * artículo en inglés no mande al lector a la versión en español. La regla está en
 * `localizeHref` (core puro y testeado).
 */
function rehypeLocalizeLinks(locale: Locale) {
  const visit = (node: HastNode): void => {
    if (node.type === "element" && node.tagName === "a" && typeof node.properties?.href === "string") {
      node.properties.href = localizeHref(node.properties.href, locale);
    }
    node.children?.forEach(visit);
  };
  return () => (tree: HastNode) => visit(tree);
}

/**
 * Compila Markdown a HTML en runtime (sin paso de build), de modo que el
 * contenido de la wiki pueda editarse en el servidor sin redesplegar la app.
 *
 * Pipeline: remark (parse + GFM para tablas/listas) → rehype → enlaces internos
 * con el prefijo del idioma → HTML string. No se permite HTML embebido en el
 * Markdown (remark-rehype lo descarta por defecto): el contenido es de confianza
 * y solo necesita Markdown puro.
 */
export async function renderMarkdown(markdown: string, locale: Locale): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeLocalizeLinks(locale))
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
