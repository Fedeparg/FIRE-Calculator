import type { Locale } from "@/core/types";
import { absoluteUrl, SITE_NAME } from "./site";
import { localizedPath } from "./seo";

/**
 * Builders de datos estructurados (schema.org / JSON-LD). Devuelven objetos
 * planos que el componente `<JsonLd>` serializa. Todas las URLs son absolutas
 * (los datos estructurados no se benefician de `metadataBase`).
 *
 * Principio: no se inventan datos. No emitimos `aggregateRating` (no tenemos
 * reseñas) ni `FAQPage` (los explainers son prosa, no pares pregunta/respuesta
 * visibles) ni `datePublished` (el frontmatter no lleva fechas).
 */

const LOGO_URL = absoluteUrl("/email-logo.png");

/** Identidad de la marca, reutilizada como autor/publicador. */
function organization() {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: LOGO_URL },
  } as const;
}

/** Organización del sitio (una vez, en el layout). */
export function organizationSchema() {
  return { "@context": "https://schema.org", ...organization() };
}

/** Sitio web (una vez, en el layout). */
export function websiteSchema(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl(localizedPath(locale, "/")),
    inLanguage: locale,
    publisher: organization(),
  };
}

/** Artículo de la wiki. */
export function articleSchema(args: {
  locale: Locale;
  slug: string;
  title: string;
  description: string;
}) {
  const { locale, slug, title, description } = args;
  const url = absoluteUrl(localizedPath(locale, `/aprende/${slug}`));
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: locale,
    url,
    mainEntityOfPage: url,
    author: organization(),
    publisher: organization(),
  };
}

/** Calculadora como aplicación web gratuita. */
export function calculatorSchema(args: {
  locale: Locale;
  slug: string;
  name: string;
  description: string;
}) {
  const { locale, slug, name, description } = args;
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    description,
    url: absoluteUrl(localizedPath(locale, `/calculadoras/${slug}`)),
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    inLanguage: locale,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "EUR" },
    publisher: organization(),
  };
}

export interface BreadcrumbItem {
  name: string;
  /** Ruta sin prefijo de idioma, empezando por `/`. */
  path: string;
}

/** Migas de pan (la versión visible vive en `<Breadcrumbs>`). */
export function breadcrumbSchema(items: BreadcrumbItem[], locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(localizedPath(locale, item.path)),
    })),
  };
}
