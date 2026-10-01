// Convención "proxy" de Next.js 16 (sustituye a "middleware"). next-intl
// gestiona aquí la detección de idioma y el routing por locale.
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Aplica a todas las rutas salvo API, estáticos, internos de Next, el generador
  // de imágenes Open Graph (/og, route handler propio sin idioma) y los endpoints
  // OAuth del servidor MCP (authorize/token/register/revoke; los .well-known ya
  // quedan excluidos por contener un punto). Estos se reescriben a la API en
  // next.config. (sitemap.xml y robots.txt ya quedan fuera por tener punto.)
  // `stats` es la analítica propia (Umami), también reescrita en next.config.
  matcher: ["/((?!api|_next|_vercel|og|authorize|token|register|revoke|stats|.*\\..*).*)"],
};
