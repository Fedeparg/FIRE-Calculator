import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/shared/seo/site";

// Las páginas rastreables pero no indexables (/gracias, /auth/verify) no se listan: llevan
// `noindex` en su metadata, y un `Disallow` impediría a Google verlo.
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/portfolio", "/entrar", "/oauth"];
  const disallow = ["/api/", ...privatePaths, ...privatePaths.map((p) => `/en${p}`)];

  return {
    rules: { userAgent: "*", allow: "/", disallow },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
