"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { safeReturnTo } from "@/shared/navigation/safe-return-to";

/** Redeems the magic-link token and redirects to the portfolio, or shows the error. */
export default function VerifyClient() {
  const t = useTranslations("auth.verify");
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const verify = useApiMutation();
  const runVerify = verify.run;
  // Prevents a double run (StrictMode in dev) that would consume the token twice.
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;

    void (async () => {
      const result = await runVerify(() => apiFetch("/api/auth/verify", { method: "POST", body: { token } }));
      if (result.ok) {
        // If we came from an OAuth flow, resume there (revalidated on read: any script on the
        // origin can write localStorage); otherwise, go to the portfolio. `window.location`
        // because /authorize is not a localized next-intl route.
        const stored = window.localStorage.getItem("sextante_return_to");
        window.localStorage.removeItem("sextante_return_to");
        const returnTo = stored ? safeReturnTo(stored, window.location.origin) : null;
        if (returnTo) {
          window.location.assign(returnTo);
        } else {
          router.replace("/portfolio");
          router.refresh();
        }
      }
    })();
  }, [token, router, runVerify]);

  // The "no token" case is an error known at render time (it needs no state).
  if (!token || verify.status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-warning">{t("error")}</p>
        <Link
          href="/entrar"
          className="rounded-lg bg-brand px-4 py-2 font-medium text-brand-fg transition hover:opacity-90"
        >
          {t("errorCta")}
        </Link>
      </div>
    );
  }

  return <p className="text-center text-muted">{t("verifying")}</p>;
}
