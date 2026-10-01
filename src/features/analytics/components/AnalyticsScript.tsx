import Script from "next/script";

import { SITE_URL } from "@/lib/site";
import { ANALYTICS_SCRIPT_SRC, ANALYTICS_WEBSITE_ID } from "../config";

/** Hostname canónico: el tracker solo mide en él, nunca en localhost ni en previews. */
const SITE_HOSTNAME = new URL(SITE_URL).hostname;

/**
 * Carga el tracker de Umami (sin cookies) desde nuestro propio origen. Sin ID de
 * sitio no renderiza nada.
 *
 * Por qué cada atributo:
 * - `data-exclude-search`: los cálculos compartibles guardan TODAS sus entradas
 *   (salario, patrimonio…) en la query string. Sin esto, la analítica las recogería.
 * - `data-exclude-hash`: el hash tampoco aporta nada a las métricas.
 * - `data-do-not-track`: si el navegador pide no ser rastreado, no se envía nada.
 * - `data-domains`: no se mide fuera del dominio canónico.
 */
export default function AnalyticsScript() {
  if (!ANALYTICS_WEBSITE_ID) return null;
  return (
    <Script
      src={ANALYTICS_SCRIPT_SRC}
      strategy="afterInteractive"
      data-website-id={ANALYTICS_WEBSITE_ID}
      data-domains={SITE_HOSTNAME}
      data-exclude-search="true"
      data-exclude-hash="true"
      data-do-not-track="true"
    />
  );
}
