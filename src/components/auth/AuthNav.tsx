"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Enlace de cabecera que muestra "Entrar" o "Mi cartera" según haya sesión.
 * Comprueba el estado en el cliente (same-origin /api/auth/me) para no convertir
 * el Header en async. No renderiza nada hasta saberlo (evita parpadeo).
 */
export default function AuthNav() {
  const t = useTranslations("auth.nav");
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((r) => {
        if (active) setAuthed(r.ok);
      })
      .catch(() => {
        if (active) setAuthed(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (authed === null) return null;

  return (
    <Link
      href={authed ? "/portfolio" : "/entrar"}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      {authed ? t("portfolio") : t("login")}
    </Link>
  );
}
