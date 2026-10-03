"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

/** Avisa cuando cambia la clase de <html> (este botón u otra pestaña vía `ThemeScript`). */
function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDarkTheme = (): boolean => document.documentElement.classList.contains("dark");

/**
 * Conmuta el tema manipulando la clase `.dark` del <html> y persistiendo en
 * localStorage. Sin next-themes: los iconos se muestran por CSS (variante `dark:`),
 * así no hay desajuste de hidratación ni parpadeo.
 *
 * Es un botón de alternancia ("Tema oscuro", pulsado o no) para que el lector de
 * pantalla anuncie el estado. Ese estado sale de la propia clase con
 * `useSyncExternalStore`: en el servidor y al hidratar vale `false` (lo que generó
 * el HTML estático) y justo después React lo corrige al valor real, sin error de
 * hidratación.
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
      // localStorage no disponible: el tema simplemente no se recuerda.
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
