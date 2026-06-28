import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// URL de la API. En dev apunta a la API local (NestJS); en prod, el servicio web
// (BFF) proxea /api al servicio `api` por la red interna de Compose
// (http://api:3001), manteniendo el navegador en same-origin.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  // Salida autocontenida (server.js + node_modules mínimo) para la imagen Docker
  // de producción. Ver Dockerfile.web.
  output: "standalone",
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
