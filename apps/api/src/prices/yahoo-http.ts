/**
 * User-Agent mínimo para las APIs no oficiales de Yahoo (precios y búsqueda). Se comprobó
 * empíricamente que Yahoo rate-limita (429) los UA que imitan un navegador o `curl` desde IPs de
 * datacenter, pero deja pasar uno mínimo.
 */
export const YAHOO_USER_AGENT = 'Mozilla/5.0';
