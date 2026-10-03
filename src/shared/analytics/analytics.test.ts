import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ANALYTICS_PATH_PREFIX, parseWebsiteId } from "./config";
import { trackEvent } from "./track";

const VALID_ID = "4f1c2b8e-9a3d-4e7f-8b21-6c5d0e9f1a2b";

describe("parseWebsiteId", () => {
  it("accepts a UUID and normalises it to lower case", () => {
    expect(parseWebsiteId(VALID_ID)).toBe(VALID_ID);
    expect(parseWebsiteId(` ${VALID_ID.toUpperCase()} `)).toBe(VALID_ID);
  });

  it("turns analytics off when the value is missing, empty or malformed", () => {
    expect(parseWebsiteId(undefined)).toBeNull();
    expect(parseWebsiteId("")).toBeNull();
    expect(parseWebsiteId("   ")).toBeNull();
    expect(parseWebsiteId("not-a-uuid")).toBeNull();
    expect(parseWebsiteId(`${VALID_ID}x`)).toBeNull();
  });
});

describe("trackEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a no-op outside the browser", () => {
    expect(() => trackEvent({ name: "position-added" })).not.toThrow();
  });

  it("is a no-op when the tracker has not loaded (or is blocked)", () => {
    vi.stubGlobal("window", {});
    expect(() => trackEvent({ name: "login-link-requested" })).not.toThrow();
  });

  it("forwards the event name and its data to the tracker", () => {
    const track = vi.fn();
    vi.stubGlobal("window", { umami: { track } });

    trackEvent({ name: "scenario-saved", data: { calculator: "fire" } });
    trackEvent({ name: "donation-checkout-started" });

    expect(track).toHaveBeenNthCalledWith(1, "scenario-saved", { calculator: "fire" });
    expect(track).toHaveBeenNthCalledWith(2, "donation-checkout-started", undefined);
  });

  it("never lets a tracker failure reach the caller", () => {
    const track = vi.fn(() => {
      throw new Error("tracker exploded");
    });
    vi.stubGlobal("window", { umami: { track } });

    expect(() => trackEvent({ name: "position-added" })).not.toThrow();
    expect(track).toHaveBeenCalledOnce();
  });
});

describe("ANALYTICS_PATH_PREFIX", () => {
  it("is excluded from the i18n proxy (the proxy.ts matcher has to be a literal)", () => {
    const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
    const segment = ANALYTICS_PATH_PREFIX.replace(/^\//, "");
    expect(proxy).toMatch(new RegExp(`matcher: \\[".*\\|${segment}\\|`));
  });
});
