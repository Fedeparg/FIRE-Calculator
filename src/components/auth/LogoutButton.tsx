"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/** Cierra la sesión (borra la cookie vía API) y vuelve al login. */
export default function LogoutButton() {
  const t = useTranslations("auth.portfolio");
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2"
    >
      {t("logout")}
    </button>
  );
}
