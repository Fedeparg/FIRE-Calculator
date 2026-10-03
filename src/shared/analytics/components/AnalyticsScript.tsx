import Script from "next/script";

import { SITE_URL } from "@/shared/seo/site";
import { ANALYTICS_SCRIPT_SRC, ANALYTICS_WEBSITE_ID } from "../config";

const SITE_HOSTNAME = new URL(SITE_URL).hostname;

// `data-exclude-search`: shareable calculations carry all their inputs (salary, net worth…)
// in the query string and must not reach analytics. `data-domains`: only tracks on the
// canonical domain, not on localhost or previews.
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
