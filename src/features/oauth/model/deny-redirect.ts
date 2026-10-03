/** Loopback hosts we may return to over `http:` (native clients, RFC 8252 §7.3). */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Fallback when there is no trusted `redirect_uri`: the home page, on our origin. */
const SAFE_FALLBACK = "/";

/**
 * Target of the consent screen's "Denegar" (Deny) button: the flow's `redirect_uri` with
 * `error=access_denied` (and the `state`), as OAuth 2.1 requires, or `/` if it is not trusted.
 *
 * `authorizeParams` arrives in the `/oauth/consent` query, which whoever sends the link controls,
 * so its `redirect_uri` is not taken at face value: it must be EXACTLY one of those registered by
 * the client (the same check the server applies on the approval path) and use `https:`, or
 * `http:` only on loopback. This closes both `javascript:` (XSS on our origin) and the open
 * redirect to an arbitrary domain. Without a registered list (the API did not respond) it goes to `/`.
 */
export function denyRedirectTarget(
  authorizeParams: string,
  clientId: string,
  registeredRedirectUris: readonly string[],
): string {
  const params = new URLSearchParams(authorizeParams);
  const redirectUri = params.get("redirect_uri");
  // The registered list belongs to `clientId`: a query naming another client is rejected.
  if (!redirectUri || params.get("client_id") !== clientId || !registeredRedirectUris.includes(redirectUri)) {
    return SAFE_FALLBACK;
  }

  let target: URL;
  try {
    target = new URL(redirectUri);
  } catch {
    return SAFE_FALLBACK;
  }
  const allowedProtocol =
    target.protocol === "https:" || (target.protocol === "http:" && LOOPBACK_HOSTS.has(target.hostname));
  if (!allowedProtocol) return SAFE_FALLBACK;

  target.searchParams.set("error", "access_denied");
  const state = params.get("state");
  if (state) target.searchParams.set("state", state);
  return target.href;
}
