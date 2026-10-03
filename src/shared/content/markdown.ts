import "server-only";

import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { localizeHref } from "@/i18n/localize-href";
import type { Locale } from "@/i18n/types";
import { isSafeHref } from "@/shared/content/safe-href";

/** Minimal HTML tree (hast) node that `rehypeLocalizeLinks` walks. */
type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * rehype plugin: prefixes internal links (`<a href="/…">`) with the locale, so an English
 * article does not send the reader to the Spanish version (the rule lives in `localizeHref`,
 * pure and tested), and REMOVES the `href` of links with a dangerous scheme (`javascript:`,
 * `data:`…; see `isSafeHref`): the text is kept, without the link.
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
 * Pipeline: remark (parse + GFM for tables/lists) → rehype → internal links with the locale
 * prefix → HTML string. Embedded HTML is not allowed in the Markdown (remark-rehype drops it by
 * default): the content is trusted and only needs plain Markdown.
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
 * One frozen processor per locale, created on first request: building the pipeline (loading and
 * configuring the plugins) on every page was repeated work. It is per locale because the link
 * plugin depends on it.
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
 * Compiles Markdown to HTML at runtime (no build step), so the wiki content can be edited on
 * the server without redeploying the app.
 */
export async function renderMarkdown(markdown: string, locale: Locale): Promise<string> {
  return String(await processorFor(locale).process(markdown));
}
