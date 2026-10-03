"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/shared/api/client";

/**
 * Account menu in the header: My account and Sign out. These used to be two more buttons in
 * the portfolio header, competing with the portfolio's own actions.
 *
 * It is a disclosure button (`aria-expanded` + `aria-controls`) with a list of links, not a
 * `role="menu"`: that way it is navigated with Tab like any link and does not require
 * implementing the menu pattern's arrow keys. It closes on Escape (returning focus to the
 * button) and on an outside click.
 */
export default function UserMenu() {
  const t = useTranslations("auth.nav");
  const tPortfolio = useTranslations("auth.portfolio");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  // By default the panel grows leftwards from the button. If the button wraps to the start of
  // a line (narrow screens), that would push it off screen: in that case it grows rightwards.
  const [alignLeft, setAlignLeft] = useState(false);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !panelRef.current) return;
    const button = buttonRef.current.getBoundingClientRect();
    setAlignLeft(button.right - panelRef.current.offsetWidth < 8);
  }, [open]);

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
    // If logout fails (session already expired, network), we still go to /entrar.
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
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
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20 C5 16 8 14 12 14 C16 14 19 16 19 20" />
        </svg>
      </button>
      {open && (
        <ul
          id={panelId}
          ref={panelRef}
          className={`absolute ${alignLeft ? "left-0" : "right-0"} z-20 mt-2 flex w-48 flex-col rounded-xl border border-border bg-surface p-1 shadow-lg`}
        >
          <li>
            <Link
              href="/portfolio/cuenta"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-surface-2"
            >
              {t("account")}
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
