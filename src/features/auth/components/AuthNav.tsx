"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useApiQuery } from "@/shared/api/use-api-query";
import { IconNavProfile } from "@/shared/illustrations";
import UserMenu from "./UserMenu";

/**
 * Enlace de cabecera que muestra "Entrar" o "Mi cartera" según haya sesión; con sesión, además,
 * el menú de la cuenta.
 * Comprueba el estado en el cliente (same-origin /api/auth/me) para no convertir
 * el Header en async. No renderiza nada hasta saberlo (evita parpadeo).
 *
 * La cabecera vive en el layout y NO se remonta al navegar: se vuelve a preguntar en cada cambio
 * de ruta, porque entrar (verify → /portfolio) o salir (logout → /entrar) cambia la sesión sin
 * recargar la página. Mientras tanto se mantiene lo último que se sabía, sin parpadeo.
 */
export default function AuthNav() {
  const t = useTranslations("auth.nav");
  const pathname = usePathname();
  const me = useApiQuery<unknown>("/api/auth/me", { keepPrevious: true });
  const { refetch } = me;
  const firstPath = useRef(pathname);

  useEffect(() => {
    // En el montaje la consulta ya está en marcha: solo se repite al cambiar de ruta.
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    refetch();
  }, [pathname, refetch]);

  if (me.status === "loading") return null;
  const authed = me.status === "ready";

  const link = (
    <Link
      href={authed ? "/portfolio" : "/entrar"}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium sm:min-h-0 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <IconNavProfile className="hidden h-4 w-4 sm:block" />
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
