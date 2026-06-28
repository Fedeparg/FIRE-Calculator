"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

/** Canjea el token del magic link y redirige a la cartera, o muestra el error. */
export default function VerifyClient() {
  const t = useTranslations("auth.verify");
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [fetchError, setFetchError] = useState(false);
  // Evita doble ejecución (StrictMode en dev) que consumiría el token dos veces.
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          // Si veníamos de un flujo OAuth, retoma ahí (ruta relativa validada);
          // si no, a la cartera. `window.location` para salir a /authorize (no es
          // ruta localizada de next-intl).
          const returnTo = window.localStorage.getItem("sextante_return_to");
          window.localStorage.removeItem("sextante_return_to");
          if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
            window.location.assign(returnTo);
          } else {
            router.replace("/portfolio");
            router.refresh();
          }
        } else {
          setFetchError(true);
        }
      } catch {
        setFetchError(true);
      }
    })();
  }, [token, router]);

  // El caso "sin token" es un error conocido en render (no necesita estado).
  if (!token || fetchError) {
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
