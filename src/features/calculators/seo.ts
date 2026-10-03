import type { Metadata } from "next";

import { buildMetadata } from "@/shared/seo/seo";

/**
 * Metadata de una página de calculadora: centraliza la ruta y la tarjeta OG (que `/og` pinta
 * con el título y la categoría de la calculadora) para que cada página quede en una línea.
 * `title`/`description` ya vienen traducidos del namespace `calc.<slug>` de la propia página.
 */
export function calculatorMetadata(args: {
  locale: string;
  slug: string;
  title: string;
  description: string;
}): Metadata {
  const { locale, slug, title, description } = args;
  return buildMetadata({
    locale,
    path: `/calculadoras/${slug}`,
    title,
    description,
    og: { kind: "calculator", slug },
  });
}
