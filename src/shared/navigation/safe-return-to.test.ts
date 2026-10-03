import { describe, expect, it } from "vitest";

import { safeReturnTo } from "./safe-return-to";

const ORIGIN = "https://sextante.example";

describe("safeReturnTo", () => {
  it("keeps a same-origin path with its query and hash", () => {
    expect(safeReturnTo("/authorize?client_id=a&state=b#x", ORIGIN)).toBe("/authorize?client_id=a&state=b#x");
    expect(safeReturnTo("/portfolio", ORIGIN)).toBe("/portfolio");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeReturnTo("https://evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("//evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("javascript:alert(1)", ORIGIN)).toBeNull();
  });

  it("rejects the backslash, which the browser turns into //", () => {
    expect(safeReturnTo("/\\evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("/\\/evil.example", ORIGIN)).toBeNull();
  });

  it("rejects tabs, newlines and other control characters", () => {
    expect(safeReturnTo("/\t/evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("/\n/evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("/\u0000x", ORIGIN)).toBeNull();
  });

  it("keeps an encoded %5C as part of the path, without leaving the origin", () => {
    expect(safeReturnTo("/%5Cevil.example", ORIGIN)).toBe("/%5Cevil.example");
  });

  it("rejects anything that does not start with /", () => {
    expect(safeReturnTo("", ORIGIN)).toBeNull();
    expect(safeReturnTo("portfolio", ORIGIN)).toBeNull();
  });
});
