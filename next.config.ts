import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// URL de la API. En dev apunta a la API local (NestJS); en prod, Caddy enruta
// /api al servicio de la API en el mismo dominio (same-origin), así que el
// rewrite solo es necesario fuera de producción.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
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
