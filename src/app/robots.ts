import type { MetadataRoute } from "next";

import { DEFAULT_LOCALE, LOCALES } from "@/i18n/types";
import { absoluteUrl } from "@/shared/seo/site";

// Las páginas rastreables pero no indexables (/gracias, /auth/verify) no se listan: llevan
// `noindex` en su metadata, y un `Disallow` impediría a Google verlo.
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
