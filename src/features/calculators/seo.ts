import type { Metadata } from "next";

import { asLocale } from "@/i18n/types";
import { buildMetadata } from "@/shared/seo/seo";
import { CALCULATORS } from "./registry";
import { CATEGORIES } from "./types";

/**
 * Metadata de una página de calculadora. Centraliza la ruta y el subtítulo OG
 * (la categoría, resuelta del registro) para que cada página quede en una línea
 * y mantenga consistencia. `title`/`description` ya vienen traducidos del
 * namespace `calc.<slug>` de la propia página.
 */
export function calculatorMetadata(args: {
  locale: string;
  slug: string;
  title: string;
  description: string;
}): Metadata {
  const { slug, title, description } = args;
  const locale = asLocale(args.locale);
  const calc = CALCULATORS.find((c) => c.slug === slug);
  const ogSubtitle = calc ? CATEGORIES[calc.category][locale] : undefined;
  return buildMetadata({
    locale,
    path: `/calculadoras/${slug}`,
    title,
    description,
    ogSubtitle,
  });
}
