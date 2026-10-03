import "server-only";

import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { localizeHref } from "@/i18n/localize-href";
import type { Locale } from "@/i18n/types";
import { isSafeHref } from "@/shared/content/safe-href";

/** Nodo mínimo del árbol HTML (hast) que recorre `rehypeLocalizeLinks`. */
type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * Plugin de rehype: prefija con el idioma los enlaces internos (`<a href="/…">`), para que un
 * artículo en inglés no mande al lector a la versión en español (la regla está en
 * `localizeHref`, pura y testeada), y QUITA el `href` de los enlaces con un esquema peligroso
 * (`javascript:`, `data:`…; ver `isSafeHref`): el texto se conserva, sin enlace.
 */
function rehypeLocalizeLinks(locale: Locale) {
  const visit = (node: HastNode): void => {
    if (node.type === "element" && node.tagName === "a" && typeof node.properties?.href === "string") {
      if (isSafeHref(node.properties.href)) {
        node.properties.href = localizeHref(node.properties.href, locale);
      } else {
        delete node.properties.href;
      }
    }
    node.children?.forEach(visit);
  };
  return () => (tree: HastNode) => visit(tree);
}

/**
 * Pipeline: remark (parse + GFM para tablas/listas) → rehype → enlaces internos
 * con el prefijo del idioma → HTML string. No se permite HTML embebido en el
 * Markdown (remark-rehype lo descarta por defecto): el contenido es de confianza
 * y solo necesita Markdown puro.
 */
function buildProcessor(locale: Locale) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeLocalizeLinks(locale))
    .use(rehypeStringify)
    .freeze();
}

/**
 * Un procesador congelado por idioma, creado la primera vez que se pide: montar el pipeline
 * (cargar y configurar los plugins) en cada página era trabajo repetido. Va por idioma porque
 * el plugin de enlaces depende de él.
 */
const processors = new Map<Locale, ReturnType<typeof buildProcessor>>();

function processorFor(locale: Locale): ReturnType<typeof buildProcessor> {
  let processor = processors.get(locale);
  if (!processor) {
    processor = buildProcessor(locale);
    processors.set(locale, processor);
  }
  return processor;
}

/**
 * Compila Markdown a HTML en runtime (sin paso de build), de modo que el
 * contenido de la wiki pueda editarse en el servidor sin redesplegar la app.
 */
export async function renderMarkdown(markdown: string, locale: Locale): Promise<string> {
  return String(await processorFor(locale).process(markdown));
}
