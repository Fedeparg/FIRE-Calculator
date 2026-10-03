import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

const MESSAGES = { es, en } as const;

type Options = Omit<RenderOptions, "wrapper"> & { locale?: keyof typeof MESSAGES };

/**
 * Testing Library's `render` inside `NextIntlClientProvider` with the locale's REAL messages
 * (Spanish by default): tests query by the text the user sees, so a renamed or deleted key
 * breaks the test just as it would break the screen.
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
