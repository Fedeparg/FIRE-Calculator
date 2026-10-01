"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconNavProfile } from "../illustrations";
import UserMenu from "./UserMenu";

/**
 * Enlace de cabecera que muestra "Entrar" o "Mi cartera" según haya sesión; con sesión, además,
 * el menú de la cuenta.
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

  const link = (
    <Link
      href={authed ? "/portfolio" : "/entrar"}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <IconNavProfile className="h-4 w-4" />
      {authed ? t("portfolio") : t("login")}
    </Link>
  );
  if (!authed) return link;
  return (
    <>
      {link}
      <UserMenu />
    </>
  );
}
