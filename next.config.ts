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
    ];
  },
};

export default withNextIntl(nextConfig);
