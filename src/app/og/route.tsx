import { readFile } from "node:fs/promises";

import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/shared/seo/site";

/**
 * Generador de imágenes Open Graph (1200×630) para tarjetas sociales. Vive fuera
 * de `/api` (proxeado a la API) y fuera del routing por idioma (excluido en
 * `proxy.ts`). Toma `title` y `subtitle` por query y pinta una tarjeta de marca.
 *
 * Es dinámica (lee la query por petición). Las fuentes se leen del disco con
 * `fs.readFile(new URL(..., import.meta.url))`: ese patrón hace que Next/Turbopack
 * incluya los .woff en el build `standalone`, y `fs` (a diferencia de `fetch`)
 * sí soporta URLs `file:`, así que funciona en el servidor de producción.
 */
const SIZE = { width: 1200, height: 630 };
const MAX_TITLE = 110;
const MAX_SUBTITLE = 90;

/**
 * Reclamo de marca al pie de la tarjeta. No puede salir de `next-intl` (esta ruta
 * vive fuera del routing por idioma), así que se resuelve con el parámetro
 * `locale` que añade `buildMetadata`.
 */
const TAGLINE: Record<string, string> = {
  es: "Calculadoras y guías de finanzas personales · España",
  en: "Personal finance calculators and guides · Spain",
};

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = clamp(searchParams.get("title") || SITE_NAME, MAX_TITLE);
  const subtitleRaw = searchParams.get("subtitle");
  const subtitle = subtitleRaw ? clamp(subtitleRaw, MAX_SUBTITLE) : null;
  const tagline = TAGLINE[searchParams.get("locale") ?? "es"] ?? TAGLINE.es;

  const [regular, bold] = await Promise.all([
    readFile(new URL("./Inter-Regular.woff", import.meta.url)),
    readFile(new URL("./Inter-Bold.woff", import.meta.url)),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px",
        background: "linear-gradient(135deg, #0b1120 0%, #1e1b4b 100%)",
        color: "#f8fafc",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        {/* Marca de la brújula: arco simple en el color de marca. */}
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "9999px",
            border: "4px solid #818cf8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#818cf8",
            fontSize: "28px",
            fontWeight: 700,
          }}
        >
          S
        </div>
        <span style={{ fontSize: "34px", fontWeight: 700, letterSpacing: "-0.02em" }}>{SITE_NAME}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {subtitle && (
          <span
            style={{
              fontSize: "30px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#a5b4fc",
            }}
          >
            {subtitle}
          </span>
        )}
        <span
          style={{
            fontSize: title.length > 55 ? "64px" : "76px",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
          }}
        >
          {title}
        </span>
      </div>

      <span style={{ fontSize: "26px", color: "#94a3b8" }}>{tagline}</span>
    </div>,
    {
      ...SIZE,
      fonts: [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: bold, weight: 700, style: "normal" },
      ],
      headers: {
        // La imagen es función pura de la query (título, subtítulo, idioma), así que
        // el mismo enlace da siempre el mismo PNG. Sin esta cabecera la ruta se
        // servía sin caché y cada vista previa de Twitter, WhatsApp o LinkedIn
        // obligaba a re-renderizar la tarjeta entera con sus fuentes.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
