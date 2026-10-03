// Self-hosted Umami. Script and events go through the same origin (`/stats/*`, next.config
// rewrites): the CSP stays at 'self'. The website ID is public (it ships in the script).

// Single source of the path: the next.config rewrites use it. The `matcher` in proxy.ts has to
// be a literal (Next analyzes it statically), so a test checks it.
export const ANALYTICS_PATH_PREFIX = "/stats";

// Umami sends events to `<script directory>/api/send`.
export const ANALYTICS_SCRIPT_SRC = `${ANALYTICS_PATH_PREFIX}/script.js`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Website ID if it is a valid UUID; otherwise `null` (avoids emitting a broken script). */
export function parseWebsiteId(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

export const ANALYTICS_WEBSITE_ID = parseWebsiteId(process.env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID);
