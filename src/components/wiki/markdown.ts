import "server-only";

import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Compila Markdown a HTML en runtime (sin paso de build), de modo que el
 * contenido de la wiki pueda editarse en el servidor sin redesplegar la app.
 *
 * Pipeline: remark (parse + GFM para tablas/listas) → rehype → HTML string.
 * No se permite HTML embebido en el Markdown (remark-rehype lo descarta por
 * defecto): el contenido es de confianza y solo necesita Markdown puro.
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
