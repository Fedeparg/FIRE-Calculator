"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { safeReturnTo } from "@/shared/navigation/safe-return-to";

/** Canjea el token del magic link y redirige a la cartera, o muestra el error. */
export default function VerifyClient() {
  const t = useTranslations("auth.verify");
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const verify = useApiMutation();
  const runVerify = verify.run;
  // Evita doble ejecución (StrictMode en dev) que consumiría el token dos veces.
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;

    void (async () => {
      const result = await runVerify(() => apiFetch("/api/auth/verify", { method: "POST", body: { token } }));
      if (result.ok) {
        // Si veníamos de un flujo OAuth, retoma ahí (se revalida al leer: localStorage lo
        // puede escribir cualquier script del origen); si no, a la cartera. `window.location`
        // para salir a /authorize (no es ruta localizada de next-intl).
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

  // El caso "sin token" es un error conocido en render (no necesita estado).
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
