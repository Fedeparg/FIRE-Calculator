import { describe, expect, it } from "vitest";

import { absoluteUrl } from "./site";
import { articleSchema, breadcrumbSchema, calculatorSchema, organizationSchema, websiteSchema } from "./json-ld";

describe("json-ld", () => {
  it("organizationSchema lleva contexto, URL absoluta y logo", () => {
    const org = organizationSchema();
    expect(org["@context"]).toBe("https://schema.org");
    expect(org["@type"]).toBe("Organization");
    expect(org.url).toBe(absoluteUrl("/"));
    expect(org.logo.url).toBe(absoluteUrl("/email-logo.png"));
  });

  it("websiteSchema apunta a la home del idioma", () => {
    expect(websiteSchema("es").url).toBe(absoluteUrl("/"));
    expect(websiteSchema("en")).toMatchObject({ url: absoluteUrl("/en"), inLanguage: "en" });
  });

  it("articleSchema usa la URL localizada y no inventa fechas ni valoraciones", () => {
    const schema = articleSchema({ locale: "en", slug: "fire", title: "T", description: "D" });
    expect(schema).toMatchObject({
      "@type": "Article",
      headline: "T",
      description: "D",
      url: absoluteUrl("/en/aprende/fire"),
      mainEntityOfPage: absoluteUrl("/en/aprende/fire"),
    });
    expect(schema).not.toHaveProperty("datePublished");
    expect(schema).not.toHaveProperty("aggregateRating");
  });

  it("calculatorSchema es una aplicación web gratuita", () => {
    const schema = calculatorSchema({ locale: "es", slug: "roi", name: "ROI", description: "D" });
    expect(schema).toMatchObject({
      "@type": "WebApplication",
      url: absoluteUrl("/calculadoras/roi"),
      isAccessibleForFree: true,
      offers: { price: 0, priceCurrency: "EUR" },
    });
  });

  it("breadcrumbSchema numera desde 1 y localiza cada ruta", () => {
    const schema = breadcrumbSchema(
      [
        { name: "Inicio", path: "/" },
        { name: "Aprende", path: "/aprende" },
      ],
      "en",
    );
    expect(schema.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Inicio", item: absoluteUrl("/en") },
      { "@type": "ListItem", position: 2, name: "Aprende", item: absoluteUrl("/en/aprende") },
    ]);
  });
});
