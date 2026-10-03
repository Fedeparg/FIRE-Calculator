/** Hosts de loopback a los que se permite volver por `http:` (clientes nativos, RFC 8252 §7.3). */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Fallback cuando no hay una `redirect_uri` de confianza: la portada, en nuestro origen. */
const SAFE_FALLBACK = "/";

/**
 * Destino del botón "Denegar" de la pantalla de consentimiento: la `redirect_uri` del flujo con
 * `error=access_denied` (y el `state`), como manda OAuth 2.1, o `/` si no es de confianza.
 *
 * `authorizeParams` llega en la query de `/oauth/consent`, que controla quien envía el enlace,
 * así que su `redirect_uri` no se cree sin más: tiene que ser EXACTAMENTE una de las registradas
 * por el cliente (lo mismo que exige el servidor en el camino de aprobación) y usar `https:`, o
 * `http:` solo en loopback. Así se cierran el `javascript:` (XSS en nuestro origen) y el open
 * redirect a un dominio arbitrario. Sin lista registrada (la API no respondió) se va a `/`.
 */
export function denyRedirectTarget(
  authorizeParams: string,
  clientId: string,
  registeredRedirectUris: readonly string[],
): string {
  const params = new URLSearchParams(authorizeParams);
  const redirectUri = params.get("redirect_uri");
  // La lista registrada es la de `clientId`: una query que hable de otro cliente no vale.
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
