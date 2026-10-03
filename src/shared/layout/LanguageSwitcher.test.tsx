import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import LanguageSwitcher from "./LanguageSwitcher";

// Ruta actual sin prefijo de idioma, como la devuelve `usePathname` de next-intl.
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  usePathname: () => "/calculadoras/hipoteca-fija",
}));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/calculadoras/hipoteca-fija?principal=200000&years=25#tabla");
  });

  it("enlaza la misma página en inglés con hrefLang y marca el idioma actual", () => {
    renderWithIntl(<LanguageSwitcher />, { locale: "es" });

    const english = screen.getByRole("link", { name: "EN" });
    expect(english).toHaveAttribute("href", "/en/calculadoras/hipoteca-fija");
    expect(english).toHaveAttribute("hrefLang", "en");
    expect(screen.getByText("ES")).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("link", { name: "ES" })).not.toBeInTheDocument();
  });

  it("desde inglés vuelve a la ruta sin prefijo (castellano, `as-needed`)", () => {
    renderWithIntl(<LanguageSwitcher />, { locale: "en" });

    expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute("href", "/calculadoras/hipoteca-fija");
  });

  it("al pulsar conserva la query y el hash actuales (los valores de la calculadora)", () => {
    renderWithIntl(<LanguageSwitcher />, { locale: "es" });
    const english = screen.getByRole("link", { name: "EN" });
    // jsdom no navega: basta con ver adónde iría el navegador tras el clic.
    english.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(english);

    expect(english).toHaveAttribute("href", "/en/calculadoras/hipoteca-fija?principal=200000&years=25#tabla");
  });
});
