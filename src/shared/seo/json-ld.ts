import type { Locale } from "@/i18n/types";
import { absoluteUrl, SITE_NAME } from "./site";
import { localizedPath } from "./seo";

/**
 * Structured data builders (schema.org / JSON-LD). They return plain objects that the
 * `<JsonLd>` component serializes. All URLs are absolute (structured data does not benefit from
 * `metadataBase`).
 *
 * Principle: no made-up data. We emit no `aggregateRating` (we have no reviews), no `FAQPage`
 * (the explainers are prose, not visible question/answer pairs) and no `datePublished` (the
 * frontmatter has no dates).
 */

const LOGO_URL = absoluteUrl("/email-logo.png");

/** Brand identity, reused as author/publisher. */
function organization() {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: LOGO_URL },
  } as const;
}

/** Site organization (once, in the layout). */
export function organizationSchema() {
  return { "@context": "https://schema.org", ...organization() };
}

/** Website (once, in the layout). */
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

/** Wiki article. */
export function articleSchema(args: { locale: Locale; slug: string; title: string; description: string }) {
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

/** Calculator as a free web application. */
export function calculatorSchema(args: { locale: Locale; slug: string; name: string; description: string }) {
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
  /** Path without the locale prefix, starting with `/`. */
  path: string;
}

/** Breadcrumbs (the visible version lives in `<Breadcrumbs>`). */
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
