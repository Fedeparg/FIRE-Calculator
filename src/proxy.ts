// Next 16 "proxy" convention (formerly "middleware"): next-intl routes by locale.
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Excludes the API, static assets, /og, the MCP OAuth endpoints and `stats` (Umami): all of them
  // are rewritten to the API in next.config. Anything with a dot (.well-known, sitemap) is already out.
  matcher: ["/((?!api|_next|_vercel|og|authorize|token|register|revoke|stats|.*\\..*).*)"],
};
