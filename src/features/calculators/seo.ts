import type { Metadata } from "next";

import { buildMetadata } from "@/shared/seo/seo";

/**
 * Metadata for a calculator page: centralises the route and the OG card (which `/og` draws with
 * the calculator's title and category) so each page stays a one-liner.
 * `title`/`description` arrive already translated from the page's own `calc.<slug>` namespace.
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
