import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { ANALYTICS_PATH_PREFIX, ANALYTICS_SCRIPT_SRC } from "./src/shared/analytics/config";

const withNextIntl = createNextIntlPlugin();

// API URL. In dev it points at the local API (NestJS); in prod the web service (BFF)
// proxies /api to the `api` service over Compose's internal network
// (http://api:3001), keeping the browser same-origin.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

// Internal Umami URL (self-hosted analytics). Optional: without it nothing is proxied and
// the script is not emitted either. In prod, Compose's internal network (http://analytics:3000).
// Like API_URL, it is frozen into the rewrites manifest at build time.
const ANALYTICS_URL = process.env.ANALYTICS_URL;

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy in allowlist mode (NO nonce): a nonce-based CSP would force
 * every page to render per request, which would defeat the static/ISR generation of the
 * calculators and the wiki. That is why `script-src` uses `'unsafe-inline'` (no hashes,
 * which would make the browser ignore `'unsafe-inline'`), needed for the flicker-free
 * theme script and Next's hydration scripts. Stripe is absent: the donation flow is a
 * REDIRECT (it neither loads Stripe.js nor uses iframes).
 *
 * The app loads NO third-party resources: no ads, no external fonts. Analytics (Umami)
 * is self-hosted and served from this same origin under /stats (see rewrites), so the
 * allowlist stays strictly 'self'.
 */
function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    "form-action": ["'self'"],
    // 'unsafe-eval' only in dev (React Fast Refresh / HMR needs it).
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'", "data:"],
    "frame-src": ["'self'"],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
  };
  if (!isDev) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Self-contained output (server.js + minimal node_modules) for the production
  // Docker image. See Dockerfile.web.
  output: "standalone",
  // No `X-Powered-By: Next.js`: do not advertise the framework (or make its CVEs easy to look up).
  poweredByHeader: false,
  async headers() {
    // Security headers on every route. Defence in depth: the app injects Markdown
    // as HTML (discarding embedded HTML).
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      {
        // Proxies /api/* to the API so dev is same-origin (like prod), avoiding
        // CORS and cross-origin cookie issues.
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
      // OAuth 2.1 endpoints of the MCP server. They live at the API ROOT (outside
      // /api) because the MCP/OAuth spec discovers them there (.well-known, /authorize…).
      // Same-origin: the browser and LLM clients always talk to the public origin;
      // here we forward them to the API. See _local/mcp-integracion.md.
      {
        source: "/.well-known/oauth-authorization-server",
        destination: `${API_URL}/.well-known/oauth-authorization-server`,
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: `${API_URL}/.well-known/oauth-protected-resource/:path*`,
      },
      { source: "/authorize", destination: `${API_URL}/authorize` },
      { source: "/token", destination: `${API_URL}/token` },
      { source: "/register", destination: `${API_URL}/register` },
      { source: "/revoke", destination: `${API_URL}/revoke` },
      // Self-hosted analytics (Umami). Only the tracker script and its send endpoint
      // are exposed: the Umami dashboard is NOT reachable from the public origin (it is
      // accessed over the local network). `/stats` is excluded from the i18n proxy.
      ...(ANALYTICS_URL
        ? [
            { source: ANALYTICS_SCRIPT_SRC, destination: `${ANALYTICS_URL}/script.js` },
            { source: `${ANALYTICS_PATH_PREFIX}/api/send`, destination: `${ANALYTICS_URL}/api/send` },
          ]
        : []),
    ];
  },
};

export default withNextIntl(nextConfig);
