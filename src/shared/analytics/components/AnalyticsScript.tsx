import Script from "next/script";

import { SITE_URL } from "@/shared/seo/site";
import { ANALYTICS_SCRIPT_SRC, ANALYTICS_WEBSITE_ID } from "../config";

const SITE_HOSTNAME = new URL(SITE_URL).hostname;

// `data-exclude-search`: los cálculos compartibles llevan todas sus entradas (salario,
// patrimonio…) en la query string y no deben llegar a la analítica. `data-domains`: solo mide
// en el dominio canónico, no en localhost ni previews.
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
