import "server-only";

import { PHASE_PRODUCTION_BUILD } from "next/constants";

/** Local development API (NestJS on its default port). */
const DEV_API_URL = "http://localhost:3001";

/**
 * Serving in production? `next build` also runs with `NODE_ENV=production`, but the build never
 * calls the API (the pages that use it are dynamic) and must not require the runtime
 * environment: CI builds without it.
 */
function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD;
}

/**
 * Internal API URL for server-side calls (Next → NestJS, bypassing the public proxy). In
 * development it falls back to the local API; in production, if it is missing or not a URL, it
 * THROWS: silently falling back to `localhost` would leave the site without sessions or
 * portfolios and no warning. (`next.config.ts` reads the same variable at build time for the
 * `rewrites`.)
 */
export function serverApiUrl(): string {
  const raw = process.env.API_URL?.trim();
  if (!raw) {
    if (isProductionRuntime()) throw new Error("API_URL is required in production (e.g. http://api:3001)");
    return DEV_API_URL;
  }
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`API_URL is not a valid URL: "${raw}"`);
  }
}
