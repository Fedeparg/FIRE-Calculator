"use client";

import type { MouseEvent } from "react";
import { useLocale } from "next-intl";

import { getPathname, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Language switcher. These are LINKS (`<a hrefLang>`), not buttons: they lead to the same page in
 * the other language, can be opened in a new tab and search engines understand them.
 *
 * It is a plain `<a>` rather than next-intl's `Link` on purpose: navigation is a full reload,
 * which keeps SSG and prevents the theme `<script>` from re-rendering on the client (a React 19
 * warning). `getPathname` computes each locale's prefix from the `routing` config (no hand-written
 * `/en`).
 */
export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname(); // path without the locale prefix (e.g. "/calculadoras/...")

  // On click, the CURRENT query and hash are appended: this keeps a calculator's values, which
  // live in the query and are written with `history.replaceState` (hence they are read on click,
  // not on render). The browser follows the already-updated `href`.
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
