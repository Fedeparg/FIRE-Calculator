import type { MetadataRoute } from "next";

import { DEFAULT_LOCALE, LOCALES } from "@/i18n/types";
import { absoluteUrl } from "@/shared/seo/site";

// Crawlable but non-indexable pages (/gracias, /auth/verify) are not listed: they carry
// `noindex` in their metadata, and a `Disallow` would stop Google from seeing it.
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/portfolio", "/entrar", "/oauth"];
  const prefixed = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).flatMap((locale) =>
    privatePaths.map((p) => `/${locale}${p}`),
  );
  const disallow = ["/api/", ...privatePaths, ...prefixed];

  return {
    rules: { userAgent: "*", allow: "/", disallow },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
