"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

/** Notifies when the <html> class changes (this button or another tab via `ThemeScript`). */
function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDarkTheme = (): boolean => document.documentElement.classList.contains("dark");

/**
 * Toggles the theme by flipping the `.dark` class on <html> and persisting it in localStorage.
 * No next-themes: the icons are switched by CSS (the `dark:` variant), so there is no hydration
 * mismatch and no flash.
 *
 * It is a toggle button ("Dark theme", pressed or not) so screen readers announce its state.
 * That state comes from the class itself via `useSyncExternalStore`: on the server and during
 * hydration it is `false` (what the static HTML was generated with) and right afterwards React
 * corrects it to the real value, with no hydration error.
 */
export default function ThemeToggle() {
  const t = useTranslations("nav");
  const dark = useSyncExternalStore(subscribeToTheme, isDarkTheme, () => false);

  function toggle() {
    const el = document.documentElement;
    const nextDark = !el.classList.contains("dark");
    el.classList.toggle("dark", nextDark);
    try {
      localStorage.setItem("theme", nextDark ? "dark" : "light");
    } catch {
      // localStorage unavailable: the theme is simply not remembered.
    }
  }

  return (
    <button
      type="button"
      aria-label={t("theme")}
      aria-pressed={dark}
      onClick={toggle}
      className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-foreground"
    >
      <MoonIcon className="block dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </button>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
