/** Schemes a content link may use: web and email. */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Dummy base to resolve relative paths and anchors, which then count as `https:`. */
const RELATIVE_BASE = "https://relative.invalid/";

/**
 * Is it safe to publish this `href` from a Markdown link? Only `http(s):`, `mailto:`, relative
 * paths and anchors. The decision uses the `URL` parser, the same algorithm the browser applies:
 * it ignores leading whitespace and control characters, embedded tabs and newlines, and the
 * scheme's case, so `" JaVa\tScript:…"` is recognized as `javascript:` and rejected. The content
 * is trusted, but with `script-src 'unsafe-inline'` a `javascript:` link would run on our
 * origin.
 */
export function isSafeHref(href: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(href, RELATIVE_BASE).protocol);
  } catch {
    return false;
  }
}
