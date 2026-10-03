/**
 * Minimal User-Agent for Yahoo's unofficial APIs (prices and search). Empirically, Yahoo
 * rate-limits (429) UAs that mimic a browser or `curl` from datacenter IPs, but lets a minimal one
 * through.
 */
export const YAHOO_USER_AGENT = 'Mozilla/5.0';
