import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

const MESSAGES = { es, en } as const;

type Options = Omit<RenderOptions, "wrapper"> & { locale?: keyof typeof MESSAGES };

/**
 * `render` de Testing Library dentro de `NextIntlClientProvider` con los mensajes REALES del
 * idioma (por defecto, castellano): los tests buscan por el texto que ve el usuario, así que una
 * clave renombrada o borrada rompe el test igual que rompería la pantalla.
 */
export function renderWithIntl(ui: ReactElement, { locale = "es", ...options }: Options = {}): RenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Madrid">
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
