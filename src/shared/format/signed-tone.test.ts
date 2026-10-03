import { describe, expect, it } from "vitest";

import { signedTone } from "./signed-tone";

describe("signedTone", () => {
  it("is green for a gain and red for a loss", () => {
    expect(signedTone(0.01)).toBe("text-success");
    expect(signedTone(-0.01)).toBe("text-danger");
  });

  it("is neutral for 0, -0, NaN or a missing figure", () => {
    expect(signedTone(0)).toBe("text-foreground");
    expect(signedTone(-0)).toBe("text-foreground");
    expect(signedTone(Number.NaN)).toBe("text-foreground");
    expect(signedTone(null, "text-muted")).toBe("text-muted");
    expect(signedTone(undefined, "text-muted")).toBe("text-muted");
  });
});
