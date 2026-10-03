import { describe, expect, it } from "vitest";

import { calculatorMetadata } from "./seo";

describe("calculatorMetadata", () => {
  it("usa la ruta de la calculadora y su tarjeta OG por slug", () => {
    const meta = calculatorMetadata({ locale: "en", slug: "roi", title: "T", description: "D" });
    expect(meta.alternates?.canonical).toBe("/en/calculadoras/roi");
    const image = (meta.twitter?.images as string[])[0];
    const params = new URL(image, "http://x").searchParams;
    expect(params.get("calc")).toBe("roi");
    expect(params.get("locale")).toBe("en");
  });
});
