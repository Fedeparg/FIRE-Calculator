import { describe, expect, it } from "vitest";

import { calculatorMetadata } from "./seo";
import { CALCULATORS } from "./registry";
import { CATEGORIES } from "./types";

describe("calculatorMetadata", () => {
  const calc = CALCULATORS[0];

  it("usa la ruta de la calculadora y su categoría traducida como subtítulo OG", () => {
    const meta = calculatorMetadata({ locale: "en", slug: calc.slug, title: "T", description: "D" });
    expect(meta.alternates?.canonical).toBe(`/en/calculadoras/${calc.slug}`);
    const image = (meta.twitter?.images as string[])[0];
    expect(new URL(image, "http://x").searchParams.get("subtitle")).toBe(CATEGORIES[calc.category].en);
  });

  it("sin calculadora en el registry omite el subtítulo en lugar de fallar", () => {
    const meta = calculatorMetadata({ locale: "es", slug: "no-existe", title: "T", description: "D" });
    const image = (meta.twitter?.images as string[])[0];
    expect(new URL(image, "http://x").searchParams.has("subtitle")).toBe(false);
  });
});
