/** C0 control characters, DEL or the backslash: the browser normalizes or ignores them when navigating. */
function hasUnsafeChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || char === "\\") return true;
  }
  return false;
}

/**
 * Validates a return target (`?returnTo=`) and reduces it to a path on OUR origin
 * (`pathname + search + hash`), or `null` if it could leave it.
 *
 * Checking only `startsWith("/") && !startsWith("//")` is not enough: `/\evil.com` or
 * `/\t/evil.com` pass that filter and the browser normalizes them to `//evil.com` (open
 * redirect). That is why backslashes and control characters are rejected, and the path is
 * resolved with `URL` against the origin, requiring that the origin does not change.
 */
export function safeReturnTo(raw: string, origin: string): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//") || hasUnsafeChar(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return url.pathname + url.search + url.hash;
}
