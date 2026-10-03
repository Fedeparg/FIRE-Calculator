import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import LanguageSwitcher from "./LanguageSwitcher";

// Current path without the locale prefix, as next-intl's `usePathname` returns it.
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  usePathname: () => "/calculadoras/hipoteca-fija",
}));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/calculadoras/hipoteca-fija?principal=200000&years=25#tabla");
  });

  it("links the same page in English with hrefLang and marks the current locale", () => {
    renderWithIntl(<LanguageSwitcher />, { locale: "es" });

    const english = screen.getByRole("link", { name: "EN" });
    expect(english).toHaveAttribute("href", "/en/calculadoras/hipoteca-fija");
    expect(english).toHaveAttribute("hrefLang", "en");
    expect(screen.getByText("ES")).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("link", { name: "ES" })).not.toBeInTheDocument();
  });

  it("from English goes back to the unprefixed path (Spanish, `as-needed`)", () => {
    renderWithIntl(<LanguageSwitcher />, { locale: "en" });

    expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute("href", "/calculadoras/hipoteca-fija");
  });

  it("keeps the current query and hash on click (the calculator values)", () => {
    renderWithIntl(<LanguageSwitcher />, { locale: "es" });
    const english = screen.getByRole("link", { name: "EN" });
    // jsdom does not navigate: it is enough to check where the browser would go after the click.
    english.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(english);

    expect(english).toHaveAttribute("href", "/en/calculadoras/hipoteca-fija?principal=200000&years=25#tabla");
  });
});
