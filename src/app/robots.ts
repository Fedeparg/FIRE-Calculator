import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/shared/seo/site";

/**
 * robots.txt. Bloquea el rastreo de zonas privadas o tras autenticación
 * (cartera, login, consentimiento OAuth) y del proxy de API. Las páginas que sí
 * son rastreables pero no deben indexarse (p. ej. /gracias, /auth/verify) NO se
 * listan aquí: llevan `noindex` en su metadata, porque un `Disallow` impediría a
 * Google ver ese `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  // Cada ruta privada en sus dos variantes de idioma (es sin prefijo, en con /en).
  const privatePaths = ["/portfolio", "/entrar", "/oauth"];
  const disallow = ["/api/", ...privatePaths, ...privatePaths.map((p) => `/en${p}`)];

  return {
    rules: { userAgent: "*", allow: "/", disallow },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
