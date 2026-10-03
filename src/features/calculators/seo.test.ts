import { describe, expect, it } from "vitest";
import { firstItem } from "@sextante/core/arrays";

import { calculatorMetadata } from "./seo";

describe("calculatorMetadata", () => {
  it("uses the calculator route and its per-slug OG card", () => {
    const meta = calculatorMetadata({ locale: "en", slug: "roi", title: "T", description: "D" });
    expect(meta.alternates?.canonical).toBe("/en/calculadoras/roi");
    const image = firstItem(meta.twitter?.images as string[]);
    const params = new URL(image, "http://x").searchParams;
    expect(params.get("calc")).toBe("roi");
    expect(params.get("locale")).toBe("en");
  });
});
