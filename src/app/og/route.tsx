import { readFile } from "node:fs/promises";

import { ImageResponse } from "next/og";

import type { Locale } from "@/i18n/types";
import { SITE_NAME } from "@/shared/seo/site";

import { resolveOgCard } from "./og-card";

/**
 * Open Graph image generator (1200×630) for social cards. It lives outside `/api`
 * (proxied to the API) and outside locale routing (excluded in `proxy.ts`). It receives
 * WHICH card to render by slug (`?calc=`, `?article=`, `?legal=` or `?page=`; see `OgCard`)
 * and resolves its title in `og-card.ts`: it does not accept free text, so nobody can
 * generate images with the brand and an arbitrary message.
 *
 * It is dynamic (reads the query per request). Fonts are read from disk with
 * `fs.readFile(new URL(..., import.meta.url))`: that pattern makes Next/Turbopack include
 * the .woff files in the `standalone` build, and `fs` (unlike `fetch`) does support
 * `file:` URLs, so it works on the production server.
 */
const SIZE = { width: 1200, height: 630 };
const MAX_TITLE = 110;
const MAX_SUBTITLE = 90;

/**
 * Brand tagline at the bottom of the card. It cannot come from `next-intl` (this route
 * lives outside locale routing), so it is resolved with the `locale` parameter that
 * `buildMetadata` adds.
 */
const TAGLINE: Record<Locale, string> = {
  es: "Calculadoras y guías de finanzas personales · España",
  en: "Personal finance calculators and guides · Spain",
};

/**
 * Both fonts, read ONCE per process (on the first request) instead of for every image.
 * If the read fails, the promise is dropped so the next request retries.
 */
let fontsPromise: Promise<[Buffer, Buffer]> | null = null;

function loadFonts(): Promise<[Buffer, Buffer]> {
  fontsPromise ??= Promise.all([
    readFile(new URL("./Inter-Regular.woff", import.meta.url)),
    readFile(new URL("./Inter-Bold.woff", import.meta.url)),
  ]).catch((error: unknown) => {
    fontsPromise = null;
    throw error;
  });
  return fontsPromise;
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export async function GET(request: Request) {
  const card = await resolveOgCard(new URL(request.url).searchParams);
  const title = clamp(card.title, MAX_TITLE);
  const subtitle = card.subtitle ? clamp(card.subtitle, MAX_SUBTITLE) : null;
  const tagline = TAGLINE[card.locale];

  const [regular, bold] = await loadFonts();

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
        {/* Compass mark: a simple arc in the brand color. */}
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
        // The image is a function of the query (which card and which locale), so the same link
        // always yields the same PNG: it is cached for a year without revalidation. If a page
        // title changes, its social preview will take a while to update; that is the price of
        // not re-rendering the card with its fonts on every preview.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
