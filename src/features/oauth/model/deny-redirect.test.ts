import { describe, expect, it } from "vitest";

import { denyRedirectTarget } from "./deny-redirect";

const CLIENT = "client-1";
const REGISTERED = "https://claude.ai/api/mcp/auth_callback";

/** `/authorize` query as the server forwards it to the consent screen. */
function authorizeParams(params: Record<string, string>): string {
  return new URLSearchParams({ client_id: CLIENT, response_type: "code", ...params }).toString();
}

describe("denyRedirectTarget", () => {
  it("returns to the registered redirect_uri with error=access_denied and the state", () => {
    const target = denyRedirectTarget(authorizeParams({ redirect_uri: REGISTERED, state: "abc" }), CLIENT, [
      REGISTERED,
    ]);

    const url = new URL(target);
    expect(url.origin + url.pathname).toBe(REGISTERED);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("omits the state when none was sent", () => {
    const target = denyRedirectTarget(authorizeParams({ redirect_uri: REGISTERED }), CLIENT, [REGISTERED]);

    expect(new URL(target).searchParams.has("state")).toBe(false);
  });

  it("never navigates to a javascript: URI, even if it is registered (XSS on our origin)", () => {
    const evil = "javascript:alert(document.cookie)//";

    expect(denyRedirectTarget(authorizeParams({ redirect_uri: evil }), CLIENT, [evil])).toBe("/");
  });

  it("rejects a redirect_uri not registered for the client (open redirect)", () => {
    expect(denyRedirectTarget(authorizeParams({ redirect_uri: "https://evil.example/cb" }), CLIENT, [REGISTERED])).toBe(
      "/",
    );
    // Exact equality: no prefixes or variants of the registered URI.
    expect(denyRedirectTarget(authorizeParams({ redirect_uri: `${REGISTERED}/../x` }), CLIENT, [REGISTERED])).toBe("/");
  });

  it("rejects a query for a client other than the one on the screen", () => {
    const params = authorizeParams({ redirect_uri: REGISTERED, client_id: "otro" });

    expect(denyRedirectTarget(params, CLIENT, [REGISTERED])).toBe("/");
  });

  it("goes to / without a registered list (the API did not respond) or without a redirect_uri", () => {
    expect(denyRedirectTarget(authorizeParams({ redirect_uri: REGISTERED }), CLIENT, [])).toBe("/");
    expect(denyRedirectTarget(authorizeParams({}), CLIENT, [REGISTERED])).toBe("/");
  });

  it("accepts http: only on loopback (native clients)", () => {
    const loopback = "http://127.0.0.1:33418/callback";
    const localhost = "http://localhost:8080/cb";
    const plainHttp = "http://example.com/cb";

    expect(denyRedirectTarget(authorizeParams({ redirect_uri: loopback }), CLIENT, [loopback])).toMatch(
      /^http:\/\/127\.0\.0\.1:33418\/callback\?error=access_denied/,
    );
    expect(denyRedirectTarget(authorizeParams({ redirect_uri: localhost }), CLIENT, [localhost])).toMatch(
      /^http:\/\/localhost:8080\/cb\?/,
    );
    expect(denyRedirectTarget(authorizeParams({ redirect_uri: plainHttp }), CLIENT, [plainHttp])).toBe("/");
  });

  it("rejects custom schemes and data:", () => {
    for (const uri of ["data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "myapp://callback"]) {
      expect(denyRedirectTarget(authorizeParams({ redirect_uri: uri }), CLIENT, [uri])).toBe("/");
    }
  });
});
