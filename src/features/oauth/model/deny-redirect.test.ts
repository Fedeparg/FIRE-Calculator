import { describe, expect, it } from "vitest";

import { denyRedirectTarget } from "./deny-redirect";

const CLIENT = "client-1";
const REGISTERED = "https://claude.ai/api/mcp/auth_callback";

/** Query de `/authorize` tal como la reenvía el servidor a la pantalla de consentimiento. */
function authorizeParams(params: Record<string, string>): string {
  return new URLSearchParams({ client_id: CLIENT, response_type: "code", ...params }).toString();
}

describe("denyRedirectTarget", () => {
  it("vuelve a la redirect_uri registrada con error=access_denied y el state", () => {
    const target = denyRedirectTarget(authorizeParams({ redirect_uri: REGISTERED, state: "abc" }), CLIENT, [
      REGISTERED,
    ]);

    const url = new URL(target);
    expect(url.origin + url.pathname).toBe(REGISTERED);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("omite el state si no venía", () => {
    const target = denyRedirectTarget(authorizeParams({ redirect_uri: REGISTERED }), CLIENT, [REGISTERED]);

    expect(new URL(target).searchParams.has("state")).toBe(false);
  });

  it("nunca navega a un javascript: aunque esté en la lista (XSS en nuestro origen)", () => {
    const evil = "javascript:alert(document.cookie)//";

    expect(denyRedirectTarget(authorizeParams({ redirect_uri: evil }), CLIENT, [evil])).toBe("/");
  });

  it("rechaza una redirect_uri que no está registrada para el cliente (open redirect)", () => {
    expect(denyRedirectTarget(authorizeParams({ redirect_uri: "https://evil.example/cb" }), CLIENT, [REGISTERED])).toBe(
      "/",
    );
    // Igualdad exacta: ni prefijos ni variantes de la registrada.
    expect(denyRedirectTarget(authorizeParams({ redirect_uri: `${REGISTERED}/../x` }), CLIENT, [REGISTERED])).toBe("/");
  });

  it("rechaza la query de otro cliente distinto del de la pantalla", () => {
    const params = authorizeParams({ redirect_uri: REGISTERED, client_id: "otro" });

    expect(denyRedirectTarget(params, CLIENT, [REGISTERED])).toBe("/");
  });

  it("va a / sin lista registrada (la API no respondió) o sin redirect_uri", () => {
    expect(denyRedirectTarget(authorizeParams({ redirect_uri: REGISTERED }), CLIENT, [])).toBe("/");
    expect(denyRedirectTarget(authorizeParams({}), CLIENT, [REGISTERED])).toBe("/");
  });

  it("acepta http: solo en loopback (clientes nativos)", () => {
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

  it("rechaza esquemas personalizados y data:", () => {
    for (const uri of ["data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "myapp://callback"]) {
      expect(denyRedirectTarget(authorizeParams({ redirect_uri: uri }), CLIENT, [uri])).toBe("/");
    }
  });
});
