import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// URL de la API. En dev apunta a la API local (NestJS); en prod, el servicio web
// (BFF) proxea /api al servicio `api` por la red interna de Compose
// (http://api:3001), manteniendo el navegador en same-origin.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

const isDev = process.env.NODE_ENV !== "production";

// Dominios de Google AdSense / CMP. Las cargas de anuncios son inertes mientras no
// haya Publisher ID, así que esta allowlist se construye a partir de la documentación
// de Google y DEBE revalidarse en navegador al activar los anuncios (puede faltar
// algún subdominio según el formato del anuncio).
const ADSENSE_SCRIPT = [
  "https://pagead2.googlesyndication.com",
  "https://partner.googleadservices.com",
  "https://tpc.googlesyndication.com",
  "https://adservice.google.com",
  "https://*.googlesyndication.com",
  "https://fundingchoicesmessages.google.com",
  "https://www.google.com",
];
const ADSENSE_FRAME = [
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  "https://*.googlesyndication.com",
  "https://www.google.com",
];
const ADSENSE_CONNECT = [
  "https://pagead2.googlesyndication.com",
  "https://*.googlesyndication.com",
  "https://*.g.doubleclick.net",
  "https://*.google.com",
];

/**
 * Content-Security-Policy en modo allowlist (NO nonce): un CSP con nonce obligaría a
 * renderizar cada página por petición, lo que anularía la generación estática/ISR de
 * las calculadoras y la wiki. Por eso `script-src` usa `'unsafe-inline'` (sin hashes,
 * que harían que el navegador ignore `'unsafe-inline'`), necesario para el script de
 * tema sin parpadeo y los scripts de hidratación de Next. Stripe no aparece: el flujo
 * de donación es una REDIRECCIÓN (no carga Stripe.js ni usa iframes).
 */
function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    "form-action": ["'self'"],
    // 'unsafe-eval' solo en dev (lo necesita React Fast Refresh / HMR).
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...ADSENSE_SCRIPT,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Imágenes de anuncios desde múltiples CDNs de Google → se permite cualquier https.
    "img-src": ["'self'", "data:", "https:"],
    "font-src": ["'self'", "data:"],
    "frame-src": ["'self'", ...ADSENSE_FRAME],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : []), ...ADSENSE_CONNECT],
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
  // Salida autocontenida (server.js + node_modules mínimo) para la imagen Docker
  // de producción. Ver Dockerfile.web.
  output: "standalone",
  async headers() {
    // Cabeceras de seguridad en todas las rutas. Defensa en profundidad: la app
    // inyecta Markdown como HTML (descartando el HTML embebido) y carga AdSense.
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      {
        // Proxea /api/* a la API para que dev sea same-origin (igual que prod),
        // evitando problemas de CORS y de cookies entre orígenes.
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
      // Endpoints OAuth 2.1 del servidor MCP. Viven en la RAÍZ de la API (fuera de
      // /api) porque la spec MCP/OAuth los descubre ahí (.well-known, /authorize…).
      // Same-origin: el navegador y los clientes LLM siempre hablan con el origen
      // público; aquí los reenviamos a la API. Ver _local/mcp-integracion.md.
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
    ];
  },
};

export default withNextIntl(nextConfig);
