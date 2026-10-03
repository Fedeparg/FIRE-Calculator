import { describe, expect, it } from "vitest";

import { signedTone } from "./signed-tone";

describe("signedTone", () => {
  it("verde si gana, rojo si pierde", () => {
    expect(signedTone(0.01)).toBe("text-success");
    expect(signedTone(-0.01)).toBe("text-danger");
  });

  it("neutro con 0, -0, NaN o sin cifra", () => {
    expect(signedTone(0)).toBe("text-foreground");
    expect(signedTone(-0)).toBe("text-foreground");
    expect(signedTone(Number.NaN)).toBe("text-foreground");
    expect(signedTone(null, "text-muted")).toBe("text-muted");
    expect(signedTone(undefined, "text-muted")).toBe("text-muted");
  });
});
