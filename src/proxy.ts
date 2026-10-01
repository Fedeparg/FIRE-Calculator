// Convención "proxy" de Next 16 (antes "middleware"): next-intl enruta por locale.
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Excluye API, estáticos, /og, los endpoints OAuth del MCP y `stats` (Umami): todos
  // se reescriben a la API en next.config. Lo que lleva punto (.well-known, sitemap) ya queda fuera.
  matcher: ["/((?!api|_next|_vercel|og|authorize|token|register|revoke|stats|.*\\..*).*)"],
};
