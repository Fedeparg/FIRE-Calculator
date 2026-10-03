"use client";

import type { SessionUser } from "@sextante/core/contracts";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useApiQuery } from "@/shared/api/use-api-query";
import { IconNavProfile } from "@/shared/illustrations";
import UserMenu from "./UserMenu";

const LINK_CLASSES =
  "inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium sm:min-h-0 text-muted transition-colors hover:bg-surface-2 hover:text-foreground";

/**
 * Header link that shows "Entrar" (Sign in) or "Mi cartera" (My portfolio) depending on the
 * session; with a session, it also shows the account menu.
 * It checks the state on the client (same-origin /api/auth/me) so the Header does not have to
 * become async. Until it knows, it renders an invisible placeholder the size of the "Entrar"
 * link (the most common case): without it, the header shifted when the response arrived.
 *
 * The header lives in the layout and is NOT remounted on navigation: it asks again on every
 * route change, because signing in (verify → /portfolio) or out (logout → /entrar) changes the
 * session without a page reload. Meanwhile it keeps the last known state, with no flicker.
 */
export default function AuthNav() {
  const t = useTranslations("auth.nav");
  const pathname = usePathname();
  const me = useApiQuery<SessionUser>("/api/auth/me", { keepPrevious: true });
  const { refetch } = me;
  const firstPath = useRef(pathname);

  useEffect(() => {
    // On mount the query is already in flight: it is only repeated on route changes.
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    refetch();
  }, [pathname, refetch]);

  if (me.status === "loading") {
    return (
      <span aria-hidden className={`${LINK_CLASSES} invisible`}>
        <IconNavProfile className="hidden h-4 w-4 sm:block" />
        {t("login")}
      </span>
    );
  }
  const authed = me.status === "ready";

  const link = (
    <Link href={authed ? "/portfolio" : "/entrar"} className={LINK_CLASSES}>
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
