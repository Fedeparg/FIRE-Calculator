"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/navigation";

/**
 * Menú de la cuenta en la cabecera: Mi cuenta y Cerrar sesión. Antes eran dos botones más en
 * la cabecera de la cartera, compitiendo con las acciones de la propia cartera.
 *
 * Es un botón de "disclosure" (`aria-expanded` + `aria-controls`) con una lista de enlaces,
 * no un `role="menu"`: así se navega con Tab como cualquier enlace y no exige implementar las
 * flechas del patrón de menú. Se cierra con Escape (devolviendo el foco al botón) y al hacer
 * clic fuera.
 */
export default function UserMenu() {
  const t = useTranslations("auth.nav");
  const tPortfolio = useTranslations("auth.portfolio");
  const tAccount = useTranslations("account");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("accountMenu")}
        onClick={() => setOpen((cur) => !cur)}
        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-brand-soft text-brand transition hover:bg-surface-2"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20 C5 16 8 14 12 14 C16 14 19 16 19 20" />
        </svg>
      </button>
      {open && (
        <ul
          id={panelId}
          className="absolute right-0 z-20 mt-2 flex w-48 flex-col rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          <li>
            <Link
              href="/portfolio/cuenta"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-surface-2"
            >
              {tAccount("link")}
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface-2"
            >
              {tPortfolio("logout")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
