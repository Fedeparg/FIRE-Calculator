"use client";

import type { MouseEvent } from "react";
import { useLocale } from "next-intl";

import { getPathname, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Cambio de idioma. Son ENLACES (`<a hrefLang>`), no botones: llevan a la misma página en el otro
 * idioma, se pueden abrir en otra pestaña y los buscadores los entienden.
 *
 * Es un `<a>` normal y no el `Link` de next-intl a propósito: la navegación es una recarga
 * completa, que conserva el SSG y evita que el `<script>` de tema se re-renderice en cliente
 * (warning de React 19). El prefijo de cada idioma lo calcula `getPathname` con la configuración
 * de `routing` (nada de `/en` a mano).
 */
export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname(); // ruta sin prefijo de idioma (p.ej. "/calculadoras/...")

  // Al pulsar se añaden la query y el hash ACTUALES: así se conservan los valores de una
  // calculadora, que viven en la query y se escriben con `history.replaceState` (por eso se leen
  // en el clic y no al renderizar). El navegador sigue el `href` ya actualizado.
  function keepQueryAndHash(event: MouseEvent<HTMLAnchorElement>) {
    const { search, hash } = window.location;
    event.currentTarget.href = `${event.currentTarget.pathname}${search}${hash}`;
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5 text-sm">
      {routing.locales.map((code) => {
        const label = code.toUpperCase();
        const className = "min-h-8 rounded-md px-2.5 py-1 font-medium transition-colors";
        return code === locale ? (
          <span key={code} aria-current="true" lang={code} className={`${className} bg-brand text-brand-fg`}>
            {label}
          </span>
        ) : (
          <a
            key={code}
            href={getPathname({ href: pathname, locale: code })}
            hrefLang={code}
            lang={code}
            onClick={keepQueryAndHash}
            className={`${className} text-muted hover:text-foreground`}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}
